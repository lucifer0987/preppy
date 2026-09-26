-- Who last changed the paper pattern, and when.
--
-- app_settings has carried `updated_at` / `updated_by` since 0002, and the
-- window screen shows "last changed ... by ...". The pattern shipped without
-- the equivalent, so the one other setting that changes what students sit had
-- no trail at all.
--
-- Per row rather than one row for the table: a change usually touches all four
-- sections, and the screen takes the most recent of them.

begin;

alter table default_sections add column if not exists updated_at timestamptz not null default now();
alter table default_sections add column if not exists updated_by uuid references profiles(id) on delete set null;

-- ------------------------------------------ a section changing hands
-- sync_attempt_sec as written in 0005 recomputed only the paper named by the
-- row it was handed. Move a section from one paper to another and the paper it
-- left keeps a length that includes minutes it no longer has -- and so a hard
-- stop later than its own sections justify. Nothing in the app does this today;
-- the trigger should not depend on that staying true.
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

comment on column default_sections.updated_at is
  'When this section default last changed. The console shows the most recent across the four.';

commit;
