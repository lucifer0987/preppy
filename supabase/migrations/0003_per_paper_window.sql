-- A window per paper, and more than one paper a day.
--
-- The window used to be global and the day was the unit: one paper per date,
-- answers unlocking at midnight, the board taking a paper in the next morning.
-- That made a second paper on the same day impossible and tied three unrelated
-- rules to the calendar.
--
-- Now each paper carries its own opening and last-entry times, and everything
-- keys off the paper's own close instead of the day's:
--
--   answers unlock        when that paper's hard stop passes
--   it joins the board    when that paper's hard stop passes
--   it enters the archive when that paper's hard stop passes
--
-- app_settings keeps its times, demoted to the default offered when scheduling.

begin;

-- Minutes from midnight IST, on the paper's own date. Minutes rather than a
-- `time` column because every comparison in the app is arithmetic on minutes,
-- and a `time` would need converting at every use.
alter table tests add column if not exists opens_at_min        smallint;
alter table tests add column if not exists entry_closes_at_min smallint;

-- Existing papers inherit whatever the global window was, so nothing moves.
update tests t
   set opens_at_min        = coalesce(t.opens_at_min, s.open_hour * 60 + s.open_minute),
       entry_closes_at_min = coalesce(t.entry_closes_at_min, s.entry_close_hour * 60 + s.entry_close_minute)
  from app_settings s
 where t.opens_at_min is null or t.entry_closes_at_min is null;

-- Belt and braces for a database with no settings row.
update tests set opens_at_min = 22 * 60 where opens_at_min is null;
update tests set entry_closes_at_min = 23 * 60 + 15 where entry_closes_at_min is null;

-- A draft has no chosen window yet, and save_paper creates drafts without
-- one, so the columns carry the shipped default. Scheduling replaces it with
-- whatever the admin picks.
alter table tests alter column opens_at_min        set default 1320;  -- 22:00
alter table tests alter column entry_closes_at_min set default 1395;  -- 23:15
alter table tests alter column opens_at_min        set not null;
alter table tests alter column entry_closes_at_min set not null;

do $$ begin
  alter table tests add constraint tests_window_within_the_day
    check (opens_at_min between 0 and 1439
           and entry_closes_at_min between 0 and 1439
           and opens_at_min < entry_closes_at_min
           -- Entry close plus one paper must land inside the same IST day, or
           -- the attempt finishes on a date the archive and the board do not
           -- key on.
           and entry_closes_at_min + 45 <= 1440);
exception when duplicate_object then null; end $$;

-- More than one paper a day. A date no longer identifies a paper, so the
-- unique constraint goes; what remains is that two papers may not open at the
-- same minute on the same day, which would be a duplicate upload rather than a
-- schedule.
alter table tests drop constraint if exists tests_date_key;
create unique index if not exists tests_one_per_date_and_opening
  on tests (date, opens_at_min);

-- With two papers possibly open at once, a student must not be sitting both.
-- One counted attempt in progress at a time, across every paper.
create unique index if not exists attempts_one_live_per_user
  on attempts (user_id) where state = 'IN_PROGRESS' and not is_dry_run;

comment on column tests.opens_at_min is
  'Minutes from midnight IST when this paper unlocks. Per paper since 0003.';
comment on column tests.entry_closes_at_min is
  'Minutes from midnight IST after which no attempt may start. Hard stop is this plus 45.';

-- start_attempt can now fail two different ways, and telling a student "you
-- have already taken this" when they actually have another paper open would
-- send them looking for the wrong thing. The unique violation is disambiguated
-- before it is raised.
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

-- save_paper replaced whatever paper held the date, because a date held at
-- most one. Now a date can hold several, so "replace" must mean the draft this
-- upload is a new version of, not everything scheduled that day.
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

commit;
