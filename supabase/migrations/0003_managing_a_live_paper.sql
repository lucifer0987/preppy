-- ---------------------------------------------------------------------------
-- 0003  Managing a paper after it has gone out
--
-- Until now a scheduled paper was immutable furniture: its window was fixed at
-- the moment it was scheduled, it ended when arithmetic said it ended, and a
-- mistake in it could only be corrected one key at a time. That is fine while
-- nothing goes wrong. What this adds is the three things an admin actually
-- reaches for when something does:
--
--   1. end it now            -- tests.ended_at, an explicit stop that beats the
--                               arithmetic one, so answers unlock immediately
--   2. put the questions right -- replace_paper_content, a whole-paper swap that
--                               keeps the paper's identity and its schedule
--   3. rescore after a change  -- apply_paper_rescore, the key-correction write
--                               without a key change, for when the marking moved
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------ 1. an early end
alter table tests add column if not exists ended_at timestamptz;

comment on column tests.ended_at is
  'Set when an admin ends the paper early. It overrides the derived hard stop: '
  'no new attempt may start, every running attempt is closed, and answers, the '
  'archive and the leaderboard open from this instant rather than from '
  'entry_closes_at_min + attempt_sec.';

-- Only a scheduled paper can have been ended, and never before it opened.
do $$ begin
  alter table tests add constraint tests_ended_only_when_scheduled
    check (ended_at is null or status = 'SCHEDULED');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- 2. replacing the questions
-- The same body as save_paper, but writing into a paper that already exists
-- rather than making a new one. The paper keeps its id, its date, its window
-- and its scheduled status, so every link to it still works and nothing has to
-- be scheduled again.
--
-- Refused outright once a student has sat it: their responses point at the
-- questions this would delete, and a score against questions that no longer
-- exist is a number with nothing behind it. Dry runs are the admin's own and
-- go with the old questions.
create or replace function replace_paper_content(p_test uuid, p jsonb)
returns jsonb language plpgsql as $$
declare
  v_section uuid;
  v_title text := nullif(p->>'title', '');
  s jsonb;
begin
  if not exists (select 1 from tests where id = p_test for update) then
    raise exception 'NO_SUCH_PAPER';
  end if;
  if exists (select 1 from attempts where test_id = p_test and not is_dry_run) then
    raise exception 'PAPER_HAS_ATTEMPTS';
  end if;

  -- Cascades to questions, direction blocks and any dry run's responses.
  delete from sections where test_id = p_test;
  delete from attempts where test_id = p_test;

  for s in select * from jsonb_array_elements(p->'sections') loop
    insert into sections (test_id, code, position, duration_sec, marks_correct, marks_negative, question_count)
      values (p_test, (s->>'code')::section_code, (s->>'position')::smallint, (s->>'duration_sec')::integer,
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

  -- The title may have changed with the file; the date and window may not.
  -- key_version moves so any attempt that read the old keys is refused.
  update tests set title = v_title, key_version = key_version + 1 where id = p_test;

  return jsonb_build_object('id', p_test);
end $$;

-- --------------------------------------------------------- 3. a plain rescore
-- apply_rescore without a key change: the marking moved, or the paper did, and
-- every finished attempt has been scored again against what the paper says now.
-- The staleness check is the same one, for the same reason.
create or replace function apply_paper_rescore(p_test uuid, p_rows jsonb)
returns integer language plpgsql as $$
declare
  moved integer;
begin
  update tests set key_version = key_version + 1 where id = p_test;

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

-- Both run as the service role only, like every other function here.
revoke all on function replace_paper_content(uuid, jsonb) from public, anon, authenticated;
revoke all on function apply_paper_rescore(uuid, jsonb) from public, anon, authenticated;
