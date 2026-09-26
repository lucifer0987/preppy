-- Two papers for one day could not both be uploaded.
--
-- 0003 dropped the one-paper-per-date rule and replaced it with a unique index
-- on (date, opens_at_min), which reads sensibly until you notice that a draft
-- has no chosen window yet: save_paper creates it with the column default, so
-- the second draft for a day always collided with the first. The feature was
-- unusable at its first step.
--
-- A draft is a working copy. Only a scheduled paper occupies a window.

begin;

drop index if exists tests_one_per_date_and_opening;

create unique index if not exists tests_one_scheduled_per_date_and_opening
  on tests (date, opens_at_min) where status = 'SCHEDULED';

commit;
