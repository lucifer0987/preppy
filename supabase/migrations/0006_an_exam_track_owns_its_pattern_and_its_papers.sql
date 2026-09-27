-- An exam track owns its pattern and its papers
--
-- Three things the PRD parked in phase 3 turn out to be one mechanism:
--
--   * "Computer Awareness and General Awareness as toggleable sections"
--   * "disciplines beyond CSE"
--   * "a second exam track with its own pattern"
--
-- The first asks for sections that are not always there. The second asks for
-- the Professional Knowledge section to be about something other than CSE.
-- The third asks for a different paper shape entirely. Bolting three switches
-- onto a fixed four-section pattern would have produced three half-answers, so
-- instead there is one thing that answers all three: a TRACK.
--
-- A track is an exam somebody is preparing for. It owns an ordered pattern of
-- sections -- any sections, any number of them, each named however that exam
-- names it -- and it owns a set of papers. A student follows one track and
-- sees only its papers and only its leaderboard.
--
-- Everything that exists today becomes the first track, so nothing moves. The
-- console shows a track anywhere only once a second one exists; a single-track
-- install looks exactly as it did.

-- ------------------------------------------------------------- the sections
-- Two more codes. An enum rather than free text, for the reason it was one
-- before: a typo in a section code would otherwise create a section nothing
-- renders and nothing scores.
--
-- Postgres allows ADD VALUE inside a transaction as long as the new value is
-- not used in the same one. Nothing below uses these, so it is safe in the
-- runner's per-file transaction.
alter type section_code add value if not exists 'COMPUTER_AWARENESS';
alter type section_code add value if not exists 'GENERAL_AWARENESS';

-- ---------------------------------------------------------------- the track
create table if not exists tracks (
  id          uuid primary key default gen_random_uuid(),
  -- Stable, and what a URL would carry. Renaming a track must not break a
  -- link, so the name is free to change and this is not.
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name        text not null check (length(btrim(name)) between 1 and 60),
  position    smallint not null unique,
  -- A track nobody is preparing for any more keeps its papers, its attempts
  -- and its board. Deactivating stops new papers being scheduled on it,
  -- exactly as deactivating an account stops the login and keeps the history.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table tracks enable row level security;

comment on table tracks is
  'An exam somebody is preparing for. Owns an ordered pattern of sections and '
  'a set of papers; a student follows exactly one.';

-- The world as it stands, named. Everything already in the database belongs
-- to this one.
insert into tracks (slug, name, position)
values ('ibps-so-it', 'IBPS SO (IT)', 1)
on conflict (slug) do nothing;

-- ------------------------------------------------------- the pattern, per track
-- This replaces default_sections rather than re-keying it. Keyed on the code
-- alone, that table was structurally incapable of holding a second pattern --
-- and re-keying it in place would have left the earlier migration's
-- `on conflict (code)` seed with no constraint to match, so the migration set
-- would no longer have been safe to re-run as a whole. A new table, filled
-- from the old one and then dropping it, keeps that property: run the set
-- twice and the second pass re-creates default_sections, finds its rows
-- already carried across, and drops it again.
create table if not exists track_sections (
  track_id        uuid not null references tracks(id) on delete cascade,
  code            section_code not null,
  position        smallint not null,
  -- What this track calls the section, when the built-in name is wrong for
  -- it. Null means the built-in name.
  label           text check (label is null or length(btrim(label)) between 1 and 60),
  question_count  smallint not null check (question_count between 1 and 200),
  duration_sec    integer  not null check (duration_sec between 60 and 10800),
  marks_correct   numeric(4,2) not null check (marks_correct > 0 and marks_correct <= 10),
  marks_negative  numeric(4,2) not null check (marks_negative >= 0 and marks_negative <= 10),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null,
  primary key (track_id, code)
);

-- Two tracks each having a section in slot 1 is the whole point, so the
-- ordering is unique within a track and not beyond it.
create unique index if not exists track_sections_one_per_position
  on track_sections (track_id, position);

alter table track_sections enable row level security;

comment on table track_sections is
  'One track''s pattern: which sections it has, in what order, and what each '
  'is worth. What a paper on that track is given when its file does not say.';
comment on column track_sections.label is
  'What this track calls the section. Professional Knowledge is (CSE) on one '
  'track and (Agriculture) on another, and neither needs a code of its own.';

-- Carry the single pattern across, if the old table is still here.
do $$ begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'default_sections') then
    execute $q$
      insert into track_sections
        (track_id, code, position, question_count, duration_sec, marks_correct, marks_negative,
         updated_at, updated_by)
      select (select id from tracks where slug = 'ibps-so-it'),
             d.code, d.position, d.question_count, d.duration_sec,
             d.marks_correct, d.marks_negative, d.updated_at, d.updated_by
        from default_sections d
      on conflict (track_id, code) do nothing
    $q$;
  end if;
end $$;

-- The first track keeps the name the product shipped with, now said out loud
-- rather than compiled into lib/types.ts.
update track_sections
   set label = 'Professional Knowledge (CSE)'
 where code = 'PK' and label is null
   and track_id = (select id from tracks where slug = 'ibps-so-it');

drop table if exists default_sections;

-- ----------------------------------------------------------- papers, per track
alter table tests add column if not exists track_id uuid references tracks(id);

update tests
   set track_id = (select id from tracks where slug = 'ibps-so-it')
 where track_id is null;

alter table tests alter column track_id set not null;

create index if not exists idx_tests_track on tests (track_id, date desc);

-- Two tracks may run a paper at the same moment on the same day: a student
-- follows one track, so there is no clash to prevent. The old index said
-- otherwise.
drop index if exists tests_one_scheduled_per_date_and_opening;
create unique index if not exists tests_one_scheduled_per_track_date_and_opening
  on tests (track_id, date, opens_at_min) where status = 'SCHEDULED';

comment on column tests.track_id is
  'The exam this paper belongs to. Decides its pattern, who is shown it, and '
  'which leaderboard it counts towards.';

-- --------------------------------------------------------- students, per track
-- Nullable, because an admin is not preparing for anything: they run every
-- track. A student without one sees no papers, which is why the console will
-- not create one that way.
alter table profiles add column if not exists track_id uuid references tracks(id);

update profiles
   set track_id = (select id from tracks where slug = 'ibps-so-it')
 where track_id is null and role = 'student';

comment on column profiles.track_id is
  'Which exam this student is preparing for. Null for an admin, who sees all '
  'of them.';

-- --------------------------------------------------------------- save_paper
-- The same function, one more column, and the draft it replaces is identified
-- within a track: the same date and the same title on another track is a
-- different paper, not a new version of this one.
create or replace function save_paper(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_date date := (p->>'date')::date;
  v_title text := nullif(p->>'title', '');
  v_track uuid := (p->>'track_id')::uuid;
  v_old uuid;
  v_test uuid;
  v_section uuid;
  s jsonb;
begin
  if v_track is null then raise exception 'NO_TRACK'; end if;

  if exists (select 1 from tests
              where track_id = v_track and date = v_date and status = 'SCHEDULED'
                and title is not distinct from v_title) then
    raise exception 'DATE_SCHEDULED';
  end if;

  select id into v_old from tests
    where track_id = v_track and date = v_date and status = 'DRAFT'
      and title is not distinct from v_title
    for update;
  if v_old is not null then
    if exists (select 1 from attempts where test_id = v_old and not is_dry_run) then
      raise exception 'DRAFT_HAS_ATTEMPTS';
    end if;
    delete from tests where id = v_old;
  end if;

  insert into tests (date, title, status, track_id) values (v_date, v_title, 'DRAFT', v_track)
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

    update questions q set direction_block_id = b.id
      from direction_blocks b
      where q.section_id = v_section and b.section_id = v_section
        and q.number between b.q_from and b.q_to;
  end loop;

  return jsonb_build_object('id', v_test, 'replaced_id', v_old);
end $$;

revoke all on function save_paper(jsonb) from public, anon, authenticated;
