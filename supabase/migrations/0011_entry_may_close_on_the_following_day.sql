-- Entry may close on the following day
--
-- 0010 let a paper FINISH after midnight. Entry itself still had to close
-- before it: entry_closes_at_min was capped at 1439, one minute to midnight,
-- so a window could not be "opens 10 PM, last entry 1 AM". An admin wanting a
-- late-night paper had to choose between the two halves of one idea.
--
-- Both numbers are minutes from midnight of the paper's own date, and that is
-- the whole mechanism: istInstant(date, 0, 1500) is 1 AM the next morning,
-- exactly as istInstant(date, 0, 1455) has always been a quarter past
-- midnight. The hard stop has read past 1440 since the beginning. Only entry
-- close was held back, by this constraint.
--
-- So entry close may now run to 2879 -- 23:59 on the day after the paper
-- opens. One day and no more: past that a window stops describing a night, and
-- a paper that takes entry for two days is better expressed as two papers.
--
-- opens_at_min is unchanged at 0..1439. A paper opens on its own date, which
-- is what that date means.

alter table tests drop constraint if exists tests_window_is_a_time_of_day;
alter table tests add constraint tests_window_is_a_time_of_day
  check (
    opens_at_min >= 0 and opens_at_min <= 1439
    and entry_closes_at_min >= 0 and entry_closes_at_min <= 2879
  );

comment on constraint tests_window_is_a_time_of_day on tests is
  'Both are minutes from midnight of the paper''s own date. Entry close may '
  'exceed 1440, meaning the following day: 1500 is 1 AM tomorrow. Opening may '
  'not -- a paper opens on the date it carries.';
