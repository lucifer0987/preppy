-- A question carries exactly four options
--
-- The baseline allowed A through E, because a real IBPS paper prints five:
-- "Out of the five answers to a question only one will be the correct answer"
-- is the wording in IBPS's own Information Handout. Preppy now runs four
-- everywhere, which is a product decision rather than a reading of the exam.
--
-- The rule already lives in the validator, which is where an admin meets it and
-- gets a message naming the question. This migration is the floor under that:
-- save_paper writes whatever JSON reaches it, an admin's key correction writes
-- a single column, and a hand-run UPDATE answers to nobody at all. A shape the
-- product depends on everywhere -- four shapes in the option motif, four
-- keyboard keys in the engine, four columns in the analysis -- should not be
-- reachable from any of those.
--
-- On the cardinality check: a CHECK constraint may not contain a subquery, so
-- "exactly these four keys" is stated as two operators instead. `?&` asserts
-- all four are present; subtracting them and comparing to an empty object
-- asserts there are no others.
--
-- This will refuse to apply to a database still holding five-option questions,
-- and that is the correct behaviour rather than something to work around: the
-- rows would be unreachable by a UI that renders four. Convert them first --
-- there is no automatic answer to which distractor should go.

alter table questions drop constraint if exists questions_correct_option_check;
alter table questions add constraint questions_correct_option_check
  check (correct_option in ('A','B','C','D'));

alter table responses drop constraint if exists responses_selected_option_check;
alter table responses add constraint responses_selected_option_check
  check (selected_option in ('A','B','C','D'));

alter table questions drop constraint if exists questions_four_options;
alter table questions add constraint questions_four_options
  check (
    jsonb_typeof(options) = 'object'
    and options ?& array['A','B','C','D']
    and (options - 'A' - 'B' - 'C' - 'D') = '{}'::jsonb
  );

comment on constraint questions_four_options on questions is
  'Every question carries exactly four options, keyed A to D. The validator '
  'says so with a message an admin can act on; this is the floor under it, for '
  'the paths that do not go through the validator.';
