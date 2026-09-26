-- Everything the schema has gained since the baseline.
--
-- 0001_baseline.sql is the schema as it was first applied by hand. This is one
-- file holding every change since, so there are two files to think about rather
-- than six: the baseline, and this.
--
-- What it adds, in order:
--
--   1. app_settings        -- the default window a new paper is offered
--   2. a window per paper  -- tests.opens_at_min / entry_closes_at_min, so a day
--                             can hold more than one paper
--   3. default_sections    -- questions, minutes and marking per section
--   4. tests.attempt_sec   -- how long one paper runs, kept in step by trigger
--
-- Safe to run twice. Every statement is `if not exists`, `create or replace`, or
-- guarded, and running it on a database that already has some of this changes
-- nothing. That matters because the baseline was applied by hand, so nothing was
-- recorded and the runner offers both files.

begin;

-- ---------------------------------------------------------------- 1. the window
-- The times were a constant in lib/time.ts. They are a scheduling decision
-- rather than a code decision, and changing them meant a deploy.
--
-- One row, enforced. A settings table that can hold two rows eventually holds
-- two rows, and then which one wins is a coin toss.
create table if not exists app_settings (
  id                    boolean primary key default true check (id),
  -- When a paper unlocks, in IST.
  open_hour             smallint not null default 22 check (open_hour between 0 and 23),
  open_minute           smallint not null default 0  check (open_minute between 0 and 59),
  -- The last moment an attempt may start. Someone starting at the instant
  -- before this still gets the full paper.
  entry_close_hour      smallint not null default 23 check (entry_close_hour between 0 and 23),
  entry_close_minute    smallint not null default 15 check (entry_close_minute between 0 and 59),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references profiles(id) on delete set null,

  constraint window_opens_before_it_closes
    check (open_hour * 60 + open_minute < entry_close_hour * 60 + entry_close_minute)
);

insert into app_settings (id) values (true) on conflict (id) do nothing;
alter table app_settings enable row level security;

-- Whether a paper fits inside its day depends on how long that paper runs, and
-- that total lives in another table -- so this row cannot check it, and the app
-- does instead (windowProblem in lib/time.ts). Dropped here in case an earlier
-- version of this file already added it.
alter table app_settings drop constraint if exists window_ends_within_the_day;

do $$ begin
  alter table app_settings add constraint window_leaves_room_in_the_day
    check (entry_close_hour * 60 + entry_close_minute < 24 * 60);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- 2. a window per paper
-- Opening and last-entry move onto the paper, set when it is scheduled. That is
-- what lets a day hold a morning paper and an evening one.
alter table tests add column if not exists opens_at_min        smallint;
alter table tests add column if not exists entry_closes_at_min smallint;

-- Papers that already existed take the settings row, then the shipped default.
update tests t
   set opens_at_min        = coalesce(t.opens_at_min, s.open_hour * 60 + s.open_minute),
       entry_closes_at_min = coalesce(t.entry_closes_at_min, s.entry_close_hour * 60 + s.entry_close_minute)
  from app_settings s
 where t.opens_at_min is null or t.entry_closes_at_min is null;

update tests set opens_at_min        = 22 * 60      where opens_at_min is null;
update tests set entry_closes_at_min = 23 * 60 + 15 where entry_closes_at_min is null;

alter table tests alter column opens_at_min        set default 1320;  -- 22:00
alter table tests alter column entry_closes_at_min set default 1395;  -- 23:15
alter table tests alter column opens_at_min        set not null;
alter table tests alter column entry_closes_at_min set not null;

do $$ begin
  alter table tests add constraint tests_window_is_a_time_of_day
    check (opens_at_min between 0 and 1439 and entry_closes_at_min between 0 and 1439);
exception when duplicate_object then null; end $$;

-- A date no longer identifies a paper, so the old uniqueness goes.
alter table tests drop constraint if exists tests_date_key;

-- Only a *scheduled* paper occupies an opening. Drafts for one day may sit side
-- by side while they are being prepared, which is how more than one paper a day
-- gets written in the first place.
drop index if exists tests_one_per_date_and_opening;
create unique index if not exists tests_one_scheduled_per_date_and_opening
  on tests (date, opens_at_min) where status = 'SCHEDULED';

-- With two papers possibly open at once, a student must not be sitting both.
create unique index if not exists attempts_one_live_per_user
  on attempts (user_id) where state = 'IN_PROGRESS' and not is_dry_run;

comment on column tests.opens_at_min is
  'Minutes from midnight IST when this paper unlocks.';
comment on column tests.entry_closes_at_min is
  'Minutes from midnight IST after which no attempt may start. Hard stop is this plus attempt_sec.';

-- start_attempt tells the two refusals apart: this student already sat this
-- paper, or they still have another one open.
create or replace function start_attempt(p_test uuid, p_user uuid, p_dry boolean)
returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_first smallint;
begin
  select min(position) into v_first from sections where test_id = p_test;
  if v_first is null then raise exception 'NO_SECTIONS'; end if;

  if p_dry then
    select id into v_id from attempts
      where test_id = p_test and user_id = p_user and is_dry_run and state = 'IN_PROGRESS';
    if v_id is not null then return v_id; end if;
  end if;

  begin
    insert into attempts (test_id, user_id, is_dry_run, started_at, state)
      values (p_test, p_user, p_dry, now(), 'IN_PROGRESS')
      returning id into v_id;
  exception when unique_violation then
    if p_dry then
      select id into v_id from attempts
        where test_id = p_test and user_id = p_user and is_dry_run and state = 'IN_PROGRESS';
      if v_id is not null then return v_id; end if;
      raise exception 'ALREADY_TAKEN';
    end if;
    -- Which of the two indexes refused?
    if exists (select 1 from attempts
                where user_id = p_user and not is_dry_run and state = 'IN_PROGRESS'
                  and test_id <> p_test) then
      raise exception 'ANOTHER_PAPER_OPEN';
    end if;
    raise exception 'ALREADY_TAKEN';
  end;

  insert into attempt_sections (attempt_id, section_id, started_at)
    select v_id, s.id, case when s.position = v_first then now() end
    from sections s where s.test_id = p_test;
  return v_id;
end $$;

-- save_paper identifies the draft it replaces by date *and* title, so a second
-- paper for the same day is a new paper rather than a replacement.
create or replace function save_paper(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_date date := (p->>'date')::date;
  v_title text := nullif(p->>'title', '');
  v_old uuid;
  v_test uuid;
  v_section uuid;
  s jsonb;
begin
  -- A date can hold several papers now, so "replace" means the draft this
  -- upload is a new version of, identified by date and title. A genuinely
  -- different paper for the same day is a new row, and a scheduled paper is
  -- never silently replaced.
  -- Re-uploading a file that matches a paper already scheduled is a mistake
  -- worth naming, rather than letting it surface as an index violation.
  if exists (select 1 from tests
              where date = v_date and status = 'SCHEDULED'
                and title is not distinct from v_title) then
    raise exception 'DATE_SCHEDULED';
  end if;

  select id into v_old from tests
    where date = v_date and status = 'DRAFT' and title is not distinct from v_title
    for update;
  if v_old is not null then
    if exists (select 1 from attempts where test_id = v_old and not is_dry_run) then
      raise exception 'DRAFT_HAS_ATTEMPTS';
    end if;
    delete from tests where id = v_old;
  end if;

  insert into tests (date, title, status) values (v_date, v_title, 'DRAFT')
    returning id into v_test;

  for s in select * from jsonb_array_elements(p->'sections') loop
    insert into sections (test_id, code, position, duration_sec, marks_correct, marks_negative, question_count)
      values (v_test, (s->>'code')::section_code, (s->>'position')::smallint, (s->>'duration_sec')::integer,
              (s->>'marks_correct')::numeric, (s->>'marks_negative')::numeric, (s->>'question_count')::smallint)
      returning id into v_section;

    insert into direction_blocks (section_id, q_from, q_to, content, table_data, image_paths)
      select v_section, (b->>'q_from')::smallint, (b->>'q_to')::smallint, b->>'content',
             nullif(b->'table_data', 'null'::jsonb),
             coalesce(array(select jsonb_array_elements_text(b->'image_paths')), '{}')
      from jsonb_array_elements(coalesce(s->'blocks', '[]'::jsonb)) b;

    insert into questions (section_id, number, text, options, correct_option, solution, tag, difficulty, image_paths)
      select v_section, (q->>'number')::smallint, q->>'text', q->'options', q->>'correct_option',
             q->>'solution', q->>'tag', q->>'difficulty',
             coalesce(array(select jsonb_array_elements_text(q->'image_paths')), '{}')
      from jsonb_array_elements(s->'questions') q;

    -- The validator refuses overlapping ranges, so each question matches at
    -- most one block.
    update questions q set direction_block_id = b.id
      from direction_blocks b
      where q.section_id = v_section and b.section_id = v_section
        and q.number between b.q_from and b.q_to;
  end loop;

  return jsonb_build_object('id', v_test, 'replaced_id', v_old);
end $$;

-- ------------------------------------------------------ 3. the default pattern
-- Questions per section, minutes per section and the marking were already
-- stored per section. What was fixed was the application insisting on one
-- pattern. This is what a paper is given when its file does not say.
create table if not exists default_sections (
  code            section_code primary key,
  position        smallint not null unique,
  question_count  smallint not null check (question_count between 1 and 200),
  duration_sec    integer  not null check (duration_sec between 60 and 10800),
  marks_correct   numeric(4,2) not null check (marks_correct > 0 and marks_correct <= 10),
  marks_negative  numeric(4,2) not null check (marks_negative >= 0 and marks_negative <= 10),
  -- Who changed it, as app_settings has carried since the window moved here.
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);

-- The pattern the product shipped with, so nothing changes until somebody
-- changes it: 55 questions in 45 minutes, +1 and -0.25.
insert into default_sections (code, position, question_count, duration_sec, marks_correct, marks_negative)
values ('QUANT',     1, 15, 12 * 60, 1, 0.25),
       ('REASONING', 2, 15, 12 * 60, 1, 0.25),
       ('ENGLISH',   3, 10,  9 * 60, 1, 0.25),
       ('PK',        4, 15, 12 * 60, 1, 0.25)
on conflict (code) do nothing;

alter table default_sections enable row level security;

comment on table default_sections is
  'The pattern a paper is given when its file does not say. Edited from the admin console.';
comment on column default_sections.updated_at is
  'When this section default last changed. The console shows the most recent across the four.';

-- ---------------------------------------------- 4. how long each paper runs
-- The hard stop is entry close plus this, so a 90-minute paper stops 90 minutes
-- after entry closes and not 45.
alter table tests add column if not exists attempt_sec integer not null default 45 * 60;

do $$ begin
  alter table tests add constraint tests_attempt_sec_sane
    check (attempt_sec between 60 and 8 * 60 * 60);
exception when duplicate_object then null; end $$;

-- Derived from the sections by trigger rather than by convention: save_paper is
-- the only writer today, but a column that silently disagrees with the rows it
-- summarises is the kind of bug that shows up as a student losing time. Both
-- sides are recomputed when a section changes hands, or the paper it left keeps
-- minutes it no longer has.
create or replace function sync_attempt_sec() returns trigger language plpgsql as $$
declare
  v_sum integer;
  v_id  uuid;
begin
  -- Both sides, when a section changes hands. `foreach` over an array keeps the
  -- two cases one piece of code rather than two that can drift.
  foreach v_id in array (
    select array_agg(distinct t) from unnest(array[
      case when tg_op <> 'DELETE' then new.test_id end,
      case when tg_op <> 'INSERT' then old.test_id end
    ]) t where t is not null
  ) loop
    select coalesce(sum(duration_sec), 45 * 60) into v_sum from sections where test_id = v_id;
    update tests set attempt_sec = v_sum where id = v_id and attempt_sec <> v_sum;
  end loop;
  return null;
end $$;

drop trigger if exists sections_keep_attempt_sec on sections;
create trigger sections_keep_attempt_sec
  after insert or update of duration_sec, test_id or delete on sections
  for each row execute function sync_attempt_sec();

-- Existing papers: take the real sum where sections exist.
update tests t set attempt_sec = s.total
  from (select test_id, sum(duration_sec) total from sections group by test_id) s
  where s.test_id = t.id and t.attempt_sec <> s.total;

-- The rule applies only once a paper is scheduled. A draft may be any length
-- while you are still deciding when to run it, and refusing the upload of a
-- 60-minute paper because the default window closes entry at 23:15 would put
-- the cart before the horse.
alter table tests drop constraint if exists tests_window_within_the_day;

do $$ begin
  alter table tests add constraint tests_window_within_the_day
    check (
      status <> 'SCHEDULED'
      or opens_at_min < entry_closes_at_min
      and entry_closes_at_min * 60 + attempt_sec <= 24 * 60 * 60
    );
exception when duplicate_object then null; end $$;

comment on column tests.attempt_sec is
  'How long one attempt at this paper runs: the sum of its sections, kept by trigger. Hard stop is entry close plus this.';

commit;
