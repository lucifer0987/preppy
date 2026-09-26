-- The paper's shape, made configurable.
--
-- Questions per section, minutes per section and the marking were already
-- stored per section in `sections`; what was fixed was the application's
-- insistence on one pattern -- 15/15/10/15 questions over 12/12/9/12 minutes,
-- +1 and -0.25 -- and a 45-minute total baked into every hard stop.
--
-- Two things change here:
--
--   1. `default_sections` holds the pattern a paper is given when its file does
--      not say. One row per section, so every number is a typed, constrained
--      column rather than a field inside a blob.
--
--   2. `tests.attempt_sec` carries how long *this* paper runs, kept in step
--      with its sections by trigger. The hard stop is still derived and never
--      stored, but it is now derived from the paper's own length.

begin;

-- ---------------------------------------------------------------- the default
create table if not exists default_sections (
  code            section_code primary key,
  position        smallint not null unique,
  question_count  smallint not null check (question_count between 1 and 200),
  duration_sec    integer  not null check (duration_sec between 60 and 10800),
  marks_correct   numeric(4,2) not null check (marks_correct > 0 and marks_correct <= 10),
  marks_negative  numeric(4,2) not null check (marks_negative >= 0 and marks_negative <= 10)
);

-- Today's pattern, so nothing changes until somebody changes it.
insert into default_sections (code, position, question_count, duration_sec, marks_correct, marks_negative)
values ('QUANT',     1, 15, 12 * 60, 1, 0.25),
       ('REASONING', 2, 15, 12 * 60, 1, 0.25),
       ('ENGLISH',   3, 10,  9 * 60, 1, 0.25),
       ('PK',        4, 15, 12 * 60, 1, 0.25)
on conflict (code) do nothing;

alter table default_sections enable row level security;

-- ------------------------------------------------- how long this paper runs
alter table tests add column if not exists attempt_sec integer not null default 45 * 60;

do $$ begin
  alter table tests add constraint tests_attempt_sec_sane
    check (attempt_sec between 60 and 8 * 60 * 60);
exception when duplicate_object then null; end $$;

-- Derived from the sections, by trigger rather than by convention: save_paper
-- is the only writer today, but a column that silently disagrees with the rows
-- it summarises is the kind of bug that shows up as a student losing time.
create or replace function sync_attempt_sec() returns trigger language plpgsql as $$
declare
  v_test uuid := coalesce(new.test_id, old.test_id);
  v_sum  integer;
begin
  select coalesce(sum(duration_sec), 45 * 60) into v_sum from sections where test_id = v_test;
  update tests set attempt_sec = v_sum where id = v_test and attempt_sec <> v_sum;
  return null;
end $$;

drop trigger if exists sections_keep_attempt_sec on sections;
create trigger sections_keep_attempt_sec
  after insert or update of duration_sec or delete on sections
  for each row execute function sync_attempt_sec();

-- Existing papers: take the real sum where sections exist.
update tests t set attempt_sec = s.total
  from (select test_id, sum(duration_sec) total from sections group by test_id) s
  where s.test_id = t.id and t.attempt_sec <> s.total;

-- ------------------------------------------------------- the window, per paper
-- Was `entry_closes_at_min + 45 <= 1440`. The 45 is now the paper's own length,
-- and the rule applies only once the paper is scheduled: a draft may be any
-- length while you are still deciding when to run it, and refusing the upload
-- of a 60-minute paper because the default window closes entry at 23:15 would
-- put the cart before the horse. Scheduling is where the window is chosen, so
-- scheduling is where the two have to agree.
alter table tests drop constraint if exists tests_window_within_the_day;

do $$ begin
  alter table tests add constraint tests_window_within_the_day
    check (
      status <> 'SCHEDULED'
      or opens_at_min < entry_closes_at_min
      and entry_closes_at_min * 60 + attempt_sec <= 24 * 60 * 60
    );
exception when duplicate_object then null; end $$;

-- The same relaxation on the defaults row. It cannot check the rule itself --
-- the total lives in another table -- so the app validates the default window
-- against the default pattern, and this keeps only what one row can know.
alter table app_settings drop constraint if exists window_ends_within_the_day;

do $$ begin
  alter table app_settings add constraint window_leaves_room_in_the_day
    check (entry_close_hour * 60 + entry_close_minute < 24 * 60);
exception when duplicate_object then null; end $$;

comment on column tests.attempt_sec is
  'How long one attempt at this paper runs: the sum of its sections, kept by trigger. Hard stop is entry close plus this.';
comment on table default_sections is
  'The pattern a paper is given when its file does not say. Edited from the admin console.';

commit;
