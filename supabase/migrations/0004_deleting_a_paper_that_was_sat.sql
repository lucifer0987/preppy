-- ---------------------------------------------------------------------------
-- 0004  Deleting a paper somebody has sat
--
-- `tests_no_delete_with_attempts` refuses to remove a paper while a counted
-- attempt points at it, and that is the right default: it is the last thing
-- standing between a misclick and a night of everybody's work.
--
-- But 0003 gave the console a way to throw a broken paper away and upload the
-- corrected one, and a paper that has been sat is exactly the case an admin
-- reaches for it in. The delete was refused at the trigger, with a message
-- written for a bug rather than for a person.
--
-- So the intent is made explicit instead of weakening the guard for everyone:
-- this function takes the attempts first, in the same transaction, which is
-- what "delete it and everything on it" actually means. Nothing else can call
-- it, and the trigger still refuses every other route.
-- ---------------------------------------------------------------------------
create or replace function delete_paper_with_attempts(p_test uuid)
returns integer language plpgsql as $$
declare
  removed integer;
begin
  if not exists (select 1 from tests where id = p_test for update) then
    raise exception 'NO_SUCH_PAPER';
  end if;

  select count(*) into removed from attempts where test_id = p_test and not is_dry_run;

  -- Responses and section rows cascade from the attempts; questions,
  -- directions and sections cascade from the paper.
  delete from attempts where test_id = p_test;
  delete from tests where id = p_test;

  return removed;
end $$;

revoke all on function delete_paper_with_attempts(uuid) from public, anon, authenticated;
