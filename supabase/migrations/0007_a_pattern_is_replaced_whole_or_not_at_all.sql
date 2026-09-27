-- A pattern is replaced whole, or not at all
--
-- savePattern wrote a track's pattern as a DELETE followed by an INSERT. Those
-- are two PostgREST calls and therefore two transactions, so a failure between
-- them leaves the track with no sections at all.
--
-- That failure is quiet, which is what makes it worth a migration rather than
-- a retry. getPattern falls back to the shipped four-section pattern when a
-- track has no rows, so a half-written save does not produce an error
-- anywhere: it produces a track that has silently become a different exam.
-- The next paper uploaded to it is then checked against a shape nobody chose,
-- and passes or fails for reasons that make no sense on screen.
--
-- The rest of this schema already answers this. save_paper writes a whole
-- paper or nothing; delete_paper_with_attempts takes the attempts and the
-- paper together. A pattern is the same kind of thing, so it gets the same
-- treatment.

create or replace function save_track_pattern(p jsonb)
returns void language plpgsql as $$
declare
  v_track uuid := (p->>'track_id')::uuid;
  s jsonb;
  v_n integer := 0;
begin
  if v_track is null then raise exception 'NO_TRACK'; end if;
  if not exists (select 1 from tracks where id = v_track) then
    raise exception 'NO_SUCH_TRACK';
  end if;

  -- A pattern with no sections is not a pattern, and it is the exact state
  -- this function exists to make unreachable.
  if jsonb_array_length(coalesce(p->'sections', '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_PATTERN';
  end if;

  -- Locking the track row means two admins saving at once queue rather than
  -- interleave their deletes and inserts.
  perform 1 from tracks where id = v_track for update;

  delete from track_sections where track_id = v_track;

  for s in select * from jsonb_array_elements(p->'sections') loop
    v_n := v_n + 1;
    insert into track_sections
      (track_id, code, position, label, question_count, duration_sec,
       marks_correct, marks_negative, updated_at, updated_by)
    values
      (v_track, (s->>'code')::section_code, v_n, nullif(s->>'label', ''),
       (s->>'question_count')::smallint, (s->>'duration_sec')::integer,
       (s->>'marks_correct')::numeric, (s->>'marks_negative')::numeric,
       now(), nullif(p->>'updated_by', '')::uuid);
  end loop;
end $$;

revoke all on function save_track_pattern(jsonb) from public, anon, authenticated;

comment on function save_track_pattern(jsonb) is
  'Replaces one track''s pattern in a single transaction. The delete and the '
  'inserts have to be atomic: a track with no sections silently reads as the '
  'shipped default pattern, which is a different exam.';
