-- A question may carry a fifth option
--
-- 0008 pinned every question to exactly four, keyed A to D. That was a product
-- decision and it is being reversed: a real IBPS paper prints five -- "Out of
-- the five answers to a question only one will be the correct answer", in
-- IBPS's own Information Handout -- and a paper written to match the exam was
-- being refused for matching it. Sixty-six blocking errors on one upload, every
-- one of them saying the file was right and the product was narrow.
--
-- So the rule becomes a floor rather than a fixed count: at least A to D, and
-- E when the question has one. Per question, not per paper. Nothing needs to
-- be migrated -- every existing four-option row still satisfies it, which is
-- what makes this safe to apply to a database mid-series.
--
-- Why five is the ceiling and not simply "any number": the option motif is
-- five shapes (PRD 8.2) and shape is what tells the options apart for a reader
-- who cannot use colour. A sixth option would be unreachable by that motif and
-- by the engine's number keys, so it is refused here rather than stored and
-- rendered wrongly.
--
-- On the cardinality check, unchanged in method from 0008: a CHECK constraint
-- may not contain a subquery, so the shape is stated with two operators. `?&`
-- asserts A to D are all present; subtracting A to E and comparing to an empty
-- object asserts nothing outside that range is. Together they admit exactly
-- {A,B,C,D} and {A,B,C,D,E} -- which also makes contiguity automatic, since
-- the only optional key is the last one.

alter table questions drop constraint if exists questions_correct_option_check;
alter table questions add constraint questions_correct_option_check
  check (correct_option in ('A','B','C','D','E'));

alter table responses drop constraint if exists responses_selected_option_check;
alter table responses add constraint responses_selected_option_check
  check (selected_option in ('A','B','C','D','E'));

alter table questions drop constraint if exists questions_four_options;
alter table questions add constraint questions_four_options
  check (
    jsonb_typeof(options) = 'object'
    and options ?& array['A','B','C','D']
    and (options - 'A' - 'B' - 'C' - 'D' - 'E') = '{}'::jsonb
  );

comment on constraint questions_four_options on questions is
  'Four options at least, keyed from A, and at most five -- E is the only '
  'optional one. The validator says so with a message naming the question; '
  'this is the floor under it, for the paths that do not go through it.';
