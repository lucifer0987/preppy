-- Preppy schema (PRD section 9). Eight tables, plus one for rate limits.
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
  -- Sound is remembered per person, not per browser (PRD 8.3). Off by default.
  sound_enabled         boolean not null default false,
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
  published_by    uuid references profiles(id) on delete set null,
  published_at    timestamptz,
  -- Set when a key correction moved any attempt's result (FR-6.9.3).
  rescored_at     timestamptz,
  -- Bumped by every key correction. An attempt is scored against the keys it
  -- read; finish_attempt refuses a score computed before a correction landed.
  key_version     integer not null default 0,
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
-- whitespace-aligned text, so its columns cannot be lost.
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
  -- Set when a key correction changed this attempt's result, so only the
  -- students it affected see the "rescored" notice (FR-6.9.4).
  rescored_at         timestamptz,
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
  -- Null until the section is opened; sections are created up front.
  started_at  timestamptz,
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

-- At most one running dry run per person per paper, so a double click on
-- Begin cannot start two. startAttempt treats the conflict as "resume it".
create unique index if not exists attempts_one_live_dry_run
  on attempts (test_id, user_id) where is_dry_run and state = 'IN_PROGRESS';

-- ---------------------------------------------------------------- guards
-- The app refuses these already; the database refuses them too, so no bug or
-- race can delete a paper students have sat, or pull it back to draft, and
-- cascade their attempts away.
create or replace function refuse_if_paper_has_attempts() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from attempts where test_id = old.id and not is_dry_run) then
    raise exception 'Paper % has student attempts and cannot be %.', old.date,
      case tg_op when 'DELETE' then 'deleted' else 'moved back to draft' end;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists tests_no_delete_with_attempts on tests;
create trigger tests_no_delete_with_attempts
  before delete on tests
  for each row execute function refuse_if_paper_has_attempts();

drop trigger if exists tests_no_unschedule_with_attempts on tests;
create trigger tests_no_unschedule_with_attempts
  before update of status on tests
  for each row when (old.status = 'SCHEDULED' and new.status = 'DRAFT')
  execute function refuse_if_paper_has_attempts();

-- ---------------------------------------------------------------- rate limits
-- Login, response writes and paper uploads are throttled (PRD 13). Kept in
-- the database, not in server memory, because a serverless host runs many
-- short-lived instances and each would keep its own count.
create table if not exists rate_limits (
  key       text primary key,
  hits      integer not null,
  reset_at  timestamptz not null
);

-- Seconds to wait before `p_key` may try again, without counting a try.
create or replace function rate_limit_wait(p_key text, p_max integer)
returns integer language sql stable as $$
  select coalesce((
    select greatest(1, ceil(extract(epoch from reset_at - now())))::integer
    from rate_limits where key = p_key and reset_at > now() and hits >= p_max
  ), 0)
$$;

-- Count one try against `p_key` in a fixed window, and return the wait that
-- now applies (0 while still under `p_max`).
create or replace function rate_limit_hit(p_key text, p_max integer, p_window_sec integer)
returns integer language plpgsql as $$
declare
  r rate_limits;
begin
  insert into rate_limits as t (key, hits, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_sec))
  on conflict (key) do update set
    hits     = case when t.reset_at <= now() then 1 else t.hits + 1 end,
    reset_at = case when t.reset_at <= now() then now() + make_interval(secs => p_window_sec) else t.reset_at end
  returning * into r;
  -- Housekeeping, now and then: expired windows are dead weight.
  if random() < 0.01 then delete from rate_limits where reset_at < now() - interval '1 day'; end if;
  if r.hits > p_max then
    return greatest(1, ceil(extract(epoch from r.reset_at - now())))::integer;
  end if;
  return 0;
end $$;

create or replace function rate_limit_clear(p_key text)
returns void language sql as $$ delete from rate_limits where key = p_key $$;

-- ---------------------------------------------------------------- sessions
-- Ends a user's Supabase sessions, optionally keeping one. Deleting the
-- session row makes Supabase Auth refuse every access token issued for it on
-- its next check, and cascades to its refresh tokens, so the device is signed
-- out at once rather than when its token expires. Used when a test starts
-- (FR-6.1.4), and on password reset and deactivation.
create or replace function revoke_user_sessions(p_user uuid, p_keep uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_user and (p_keep is null or id <> p_keep);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- attempts
-- Creates an attempt with a row per section, the first one open, in one
-- transaction: a half-created attempt with no sections could never load, and
-- the one-attempt index would stop its owner starting again. A dry run that
-- is already running is returned instead of starting a second.
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
    end if;
    raise exception 'ALREADY_TAKEN';
  end;

  insert into attempt_sections (attempt_id, section_id, started_at)
    select v_id, s.id, case when s.position = v_first then now() end
    from sections s where s.test_id = p_test;
  return v_id;
end $$;

-- The two integrity counters, incremented in place (FR-6.5.4), so two bumps
-- landing together cannot lose one. Only while the attempt runs.
create or replace function bump_attempt_counter(p_attempt uuid, p_which text)
returns void language plpgsql as $$
begin
  if p_which = 'fullscreen_exits' then
    update attempts set fullscreen_exits = fullscreen_exits + 1 where id = p_attempt and state = 'IN_PROGRESS';
  elsif p_which = 'tab_switches' then
    update attempts set tab_switches = tab_switches + 1 where id = p_attempt and state = 'IN_PROGRESS';
  else
    raise exception 'Unknown counter %', p_which;
  end if;
end $$;

-- ---------------------------------------------------------------- papers
-- Saves a validated paper as a DRAFT, replacing a draft for the same date,
-- in one transaction: either the whole new paper exists or nothing changed.
-- A scheduled paper, or a draft students have sat, is never replaced.
-- `p` is lib/paper-rows.ts's payload. Returns {id, replaced_id}.
create or replace function save_paper(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_date date := (p->>'date')::date;
  v_old uuid;
  v_old_status test_status;
  v_test uuid;
  v_section uuid;
  s jsonb;
begin
  select id, status into v_old, v_old_status from tests where date = v_date for update;
  if v_old is not null then
    if v_old_status <> 'DRAFT' then raise exception 'DATE_SCHEDULED'; end if;
    if exists (select 1 from attempts where test_id = v_old and not is_dry_run) then
      raise exception 'DRAFT_HAS_ATTEMPTS';
    end if;
    delete from tests where id = v_old;
  end if;

  insert into tests (date, title, status) values (v_date, nullif(p->>'title', ''), 'DRAFT')
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

-- Applies a key correction and the rescored attempts together (FR-6.9.3):
-- the key and the scores can never disagree. `p_rows` holds one entry per
-- finished attempt, scored against the new key by lib/repo/rescore.ts. If an
-- attempt finished after those scores were computed it is not in `p_rows`,
-- and the whole correction is refused so the caller recomputes.
create or replace function apply_rescore(p_test uuid, p_question uuid, p_answer text, p_rows jsonb)
returns integer language plpgsql as $$
declare
  moved integer;
begin
  -- First, so this holds the paper's row lock for the whole correction: a
  -- finish_attempt reading the version waits for this to commit, and one that
  -- got in first has already finished its attempt, which the stale check below
  -- then sees.
  update tests set key_version = key_version + 1 where id = p_test;

  update questions set correct_option = p_answer
    where id = p_question and section_id in (select id from sections where test_id = p_test);
  if not found then raise exception 'QUESTION_NOT_ON_PAPER'; end if;

  if exists (
    select 1 from attempts a
    where a.test_id = p_test and a.state in ('SUBMITTED', 'AUTO_SUBMITTED')
      and not exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'id')::uuid = a.id)
  ) then
    raise exception 'RESCORE_STALE';
  end if;

  update attempts a set
    total_score    = (r->>'total_score')::numeric,
    section_scores = r->'section_scores',
    attempted      = (r->>'attempted')::smallint,
    correct        = (r->>'correct')::smallint,
    wrong          = (r->>'wrong')::smallint,
    skipped        = (r->>'skipped')::smallint,
    not_reached    = (r->>'not_reached')::smallint,
    rescored_at    = case when (r->>'moved')::boolean then now() else a.rescored_at end
  from jsonb_array_elements(p_rows) r
  where a.id = (r->>'id')::uuid and a.test_id = p_test and a.state in ('SUBMITTED', 'AUTO_SUBMITTED');

  select count(*) into moved from jsonb_array_elements(p_rows) r where (r->>'moved')::boolean;
  if moved > 0 then update tests set rescored_at = now() where id = p_test; end if;
  return moved;
end $$;

-- Records a finished attempt's score, if it was computed against the paper's
-- current keys. Returns 'ok', 'done' (someone else finished it first) or
-- 'stale' (a key was corrected meanwhile: score again). Without the version
-- check, a submit that read the keys just before a rescore could commit a
-- score against the old key after the rescore had finished.
create or replace function finish_attempt(p_attempt uuid, p_state attempt_state, p_key_version integer, p_score jsonb)
returns text language plpgsql as $$
declare
  v_state attempt_state;
  v_version integer;
begin
  -- The paper row is read FOR SHARE so a key correction in progress (which
  -- holds it FOR UPDATE, see apply_rescore) is waited for, not raced.
  select t.key_version into v_version
    from tests t where t.id = (select test_id from attempts where id = p_attempt)
    for share;
  select state into v_state from attempts where id = p_attempt for update;
  if v_state is null or v_state <> 'IN_PROGRESS' then return 'done'; end if;
  if v_version <> p_key_version then return 'stale'; end if;
  update attempts set
    state          = p_state,
    submitted_at   = now(),
    total_score    = (p_score->>'total_score')::numeric,
    section_scores = p_score->'section_scores',
    attempted      = (p_score->>'attempted')::smallint,
    correct        = (p_score->>'correct')::smallint,
    wrong          = (p_score->>'wrong')::smallint,
    skipped        = (p_score->>'skipped')::smallint,
    not_reached    = (p_score->>'not_reached')::smallint,
    time_spent_sec = (p_score->>'time_spent_sec')::integer
  where id = p_attempt;
  return 'ok';
end $$;

-- Only the server's service-role key may call these. Functions are
-- executable by everyone by default, and revoke_user_sessions runs with
-- elevated rights, so a leaked anon key must not reach any of them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'rate_limit_wait(text, integer)', 'rate_limit_hit(text, integer, integer)', 'rate_limit_clear(text)',
    'revoke_user_sessions(uuid, uuid)', 'start_attempt(uuid, uuid, boolean)',
    'bump_attempt_counter(uuid, text)', 'save_paper(jsonb)', 'apply_rescore(uuid, uuid, text, jsonb)',
    'finish_attempt(uuid, attempt_state, integer, jsonb)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;

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
alter table rate_limits       enable row level security;

commit;
