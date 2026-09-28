-- A window is the admin's to choose
--
-- Two constraints made the calendar decide where a paper could sit:
--
--   tests_window_within_the_day     entry close + the paper's length had to
--                                   land on or before 24:00
--   window_leaves_room_in_the_day   the same rule for the default times
--
-- So a 45-minute paper could not take entry after 23:15, and an admin wanting
-- one that ran 11:30 PM to 12:15 AM was told to pick a different time. The
-- refusal read as a law of the product. It was not one.
--
-- Nothing depended on it. A paper's instants have always been computed from
-- its own opening day -- istInstant(date, 0, minutes), so minute 1455 is a
-- quarter past midnight the following morning -- and windowState has always
-- returned ENTRY_CLOSED at 00:10 and CLOSED at 00:20 for such a paper. The
-- clock was ready; only the check refused.
--
-- What a paper belongs to is its date, not the hours it happens to occupy. The
-- archive, the leaderboard and the streak all group by that date, and they go
-- on doing so for a paper that finishes after midnight.
--
-- What is kept: entry must open before it closes, both are times of day, and
-- tests_attempt_sec_sane still caps a paper at eight hours -- which is what
-- lets lib/repo/papers.ts look one day back rather than guessing how far.

alter table tests drop constraint if exists tests_window_within_the_day;
-- Dropped first so a second run of this file is a no-op, as every file here is.
alter table tests drop constraint if exists tests_window_opens_before_it_closes;
alter table tests add constraint tests_window_opens_before_it_closes
  check (status <> 'SCHEDULED' or opens_at_min < entry_closes_at_min);

alter table app_settings drop constraint if exists window_leaves_room_in_the_day;

comment on constraint tests_window_opens_before_it_closes on tests is
  'Entry opens before it closes, and that is the whole of it. A paper may run '
  'past midnight: it belongs to its date, not to the hours it occupies.';
