-- Preppy schema (PRD section 9). Eight tables.
--
-- SECURITY MODEL (FR-10.4): the browser never talks to this database. Every
-- query runs in Next.js server code using the service-role key. RLS is enabled
-- on every table with no permissive policy, so any client holding only the
-- anon key reads nothing. That is the backstop, not the primary defence.
--
-- Run this once in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f supabase/schema.sql

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type user_role   as enum ('student', 'admin');
  -- LIVE and CLOSED are derived from the clock (FR-10.1), never stored.
  create type test_status as enum ('DRAFT', 'SCHEDULED');
  create type section_code as enum ('QUANT', 'REASONING', 'ENGLISH', 'PK');
  create type attempt_state as enum ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'VOIDED');
  create type section_end_reason as enum ('SUBMITTED', 'TIMER_EXPIRED', 'FORCE_CLOSED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- profiles
-- One row per account, keyed to Supabase Auth. Usernames map to a synthetic
-- internal address <username>@preppy.local that never receives mail.
create table if not exists profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  username              text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name          text not null,
  role                  user_role not null default 'student',
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  last_login_at         timestamptz
);

-- ---------------------------------------------------------------- tests
-- status is DRAFT or SCHEDULED/PUBLISHED only. Whether a paper is LIVE or
-- CLOSED is derived from the clock on read (FR-10.1), never stored.
create table if not exists tests (
  id              uuid primary key default gen_random_uuid(),
  date            date not null unique,
  title           text,
  status          test_status not null default 'DRAFT',
  source_pdf_path text,
  published_by    uuid references profiles(id),
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- sections
create table if not exists sections (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references tests(id) on delete cascade,
  code            section_code not null,
  position        smallint not null,
  duration_sec    integer not null check (duration_sec between 60 and 10800),
  marks_correct   numeric(4,2) not null default 1,
  marks_negative  numeric(4,2) not null default 0.25,
  question_count  smallint not null,
  unique (test_id, code),
  unique (test_id, position)
);

-- ---------------------------------------------------------------- direction blocks
-- Shared passages, DI tables and puzzles. The table is structured data, never
-- whitespace-aligned text, because a PDF collapses runs of spaces.
create table if not exists direction_blocks (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references sections(id) on delete cascade,
  q_from      smallint not null,
  q_to        smallint not null,
  content     text not null,
  table_data  jsonb,
  image_paths text[] not null default '{}',
  check (q_from <= q_to)
);

-- ---------------------------------------------------------------- questions
-- Options live inline as {"A": "...", ...}; they are never queried alone.
create table if not exists questions (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references sections(id) on delete cascade,
  direction_block_id  uuid references direction_blocks(id) on delete set null,
  number              smallint not null check (number between 1 and 55),
  text                text not null,
  options             jsonb not null,
  correct_option      char(1) not null check (correct_option in ('A','B','C','D','E')),
  solution            text,
  tag                 text,
  difficulty          text check (difficulty in ('Easy','Medium','Hard')),
  image_paths         text[] not null default '{}',
  unique (section_id, number)
);

-- ---------------------------------------------------------------- attempts
-- is_dry_run is how the admin is kept off the leaderboard (FR-5.2): admin
-- attempts are always dry runs, so no exclusion logic is needed anywhere else.
create table if not exists attempts (
  id                  uuid primary key default gen_random_uuid(),
  test_id             uuid not null references tests(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  state               attempt_state not null default 'IN_PROGRESS',
  is_dry_run          boolean not null default false,
  started_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  total_score         numeric(6,2),
  section_scores      jsonb,
  attempted           smallint,
  correct             smallint,
  wrong               smallint,
  skipped             smallint,
  not_reached         smallint,
  time_spent_sec      integer,
  fullscreen_exits    integer not null default 0,
  tab_switches        integer not null default 0,
  created_at          timestamptz not null default now()
);

-- One counted attempt per person per paper. Dry runs are exempt so the admin
-- can rehearse a paper as often as they like.
create unique index if not exists attempts_one_real_per_user_per_test
  on attempts (test_id, user_id) where not is_dry_run;

-- ---------------------------------------------------------------- attempt sections
create table if not exists attempt_sections (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  end_reason  section_end_reason,
  unique (attempt_id, section_id)
);

-- ---------------------------------------------------------------- responses
-- A row is written the moment a question is OPENED, not only when answered.
-- That is what separates "not reached" from "skipped" (FR-3.4, FR-9.1):
--   no row at section end          -> not reached
--   row with selected_option null  -> skipped
create table if not exists responses (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references attempts(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  selected_option char(1) check (selected_option in ('A','B','C','D','E')),
  is_marked       boolean not null default false,
  was_visited     boolean not null default true,
  time_spent_sec  integer not null default 0,
  updated_at      timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------- indexes
create index if not exists idx_attempts_test_score on attempts (test_id, total_score desc);
create index if not exists idx_attempts_user       on attempts (user_id);
create index if not exists idx_responses_attempt   on responses (attempt_id);
create index if not exists idx_questions_section   on questions (section_id, number);
create index if not exists idx_sections_test       on sections (test_id, position);
create index if not exists idx_tests_date          on tests (date desc);

-- ---------------------------------------------------------------- RLS: deny all
-- Enabling RLS with no permissive policy denies every normal role. The
-- service-role key used by the Next.js server bypasses RLS entirely, so this
-- costs nothing there while making a leaked anon key useless.
alter table profiles          enable row level security;
alter table tests             enable row level security;
alter table sections          enable row level security;
alter table direction_blocks  enable row level security;
alter table questions         enable row level security;
alter table attempts          enable row level security;
alter table attempt_sections  enable row level security;
alter table responses         enable row level security;

commit;
