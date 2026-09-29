-- A window is as long as the admin makes it
--
-- 0011 let entry close on the following day and capped it there, at 2879
-- minutes, with the reasoning that "past that a window stops describing a
-- night". That was a product opinion dressed as a constraint, and it is the
-- wrong one: how long a paper takes entry for is a property of that paper, and
-- the person who knows is the admin setting it. A group that wants a paper
-- open all week so everyone can sit it around their own work could not say so,
-- and the date picker greyed out every day but two.
--
-- So the ceiling goes. entry_closes_at_min stays what it has always been --
-- minutes from midnight of the paper's own date -- and may now be any of them.
-- 4320 is 23:59 two days later; 14400 is ten days later. The floor stays,
-- because a negative offset is not a window, and opens_at_min stays 0..1439
-- because a paper opens on the date it carries.
--
-- tests_window_opens_before_it_closes is untouched and still does the work
-- that matters: entry opens before it closes.
--
-- What this costs elsewhere, since it is not free. Two queries used to assume
-- a paper could not still be live more than a day after its date, and looked
-- back exactly one day when asking what is open now. With no ceiling that
-- assumption has no basis, so both stopped using a date floor and decide from
-- the window itself. See lib/repo/papers.ts (upcomingPapers) and the admin
-- console's home.

-- The column was smallint, which is its own ceiling: 32767 minutes is 22 days
-- and a bit, so "open for a month" would have failed on the type rather than
-- on any rule. A window is a count of minutes and integer is what that is.
alter table tests alter column entry_closes_at_min type integer;

alter table tests drop constraint if exists tests_window_is_a_time_of_day;
alter table tests add constraint tests_window_is_a_time_of_day
  check (
    opens_at_min >= 0 and opens_at_min <= 1439
    and entry_closes_at_min >= 0
  );

comment on constraint tests_window_is_a_time_of_day on tests is
  'Both are minutes from midnight of the paper''s own date. Entry close has no '
  'ceiling: a paper takes entry for as long as its admin says, and 2880 is '
  'simply two days on. Opening may not -- a paper opens on the date it carries.';
