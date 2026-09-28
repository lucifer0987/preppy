-- Two papers may be open at once
--
-- Until now a night could hold two papers only if their windows did not
-- overlap, enforced in two places: overlappingPaper in lib/repo/papers.ts, and
-- a unique index keyed on the opening minute. Between them they allowed
-- "morning paper, then evening paper" and refused "both available all evening,
-- sit either".
--
-- The refusal was never about the database. attempts_one_live_per_user has
-- said since the baseline that a student may hold one running attempt and no
-- more, and its own comment reads "with two papers possibly open at once, a
-- student must not be sitting both". Simultaneous papers were anticipated; the
-- engine has always been safe for them. What was missing was a dashboard that
-- could show more than one, and that now exists.
--
-- So the opening minute stops being part of a paper's identity. What remains
-- is the key save_paper already uses and the console already teaches: a paper
-- is its exam, its date and its name.
--
-- coalesce, because two untitled papers on one night are the same mistake this
-- index exists to catch. In Postgres a NULL is distinct from every other NULL,
-- so a plain unique index on (track_id, date, title) would let any number of
-- untitled papers through -- which is precisely the case a tired admin
-- uploading the same file twice would hit.

drop index if exists tests_one_scheduled_per_track_date_and_opening;

create unique index if not exists tests_one_scheduled_per_track_date_and_title
  on tests (track_id, date, coalesce(title, ''))
  where status = 'SCHEDULED';

comment on index tests_one_scheduled_per_track_date_and_title is
  'A paper is its exam, its date and its name. Two may share a night and even '
  'a window -- a student can only sit one at a time, which attempts_one_live_'
  'per_user enforces -- but two with the same name on one night are the same '
  'paper published twice.';
