-- A paper may hold more than 55 questions
--
-- The baseline pinned questions.number to 1..55, which was the IBPS SO (IT)
-- pattern written into the schema back when it was the only pattern there
-- would ever be.
--
-- Counts became configurable afterwards, in two places. The admin console's
-- Paper pattern screen accepts up to 200 questions a section, and a paper's
-- own file may state a questionCount up to the same. Neither was reconciled
-- with this constraint, so a 60-question paper passed the checker, passed the
-- preview, was saved as a draft, and then failed on insert with a raw
-- constraint violation -- the one message an admin has no way to act on.
--
-- The promise the product makes is the one that should hold, so the bound
-- moves to match it: four sections at the form's own maximum. It is a ceiling
-- against a runaway file rather than a statement about any exam, which is
-- what 55 was and what made it wrong to keep.
--
-- Widening a check is safe for every row already stored, and nothing has to
-- be rewritten: every existing question already satisfies the new bound.

alter table questions drop constraint if exists questions_number_check;

alter table questions add constraint questions_number_check
  check (number between 1 and 800);

comment on column questions.number is
  'Position within the paper: unique per section, continuous across the paper, '
  'and inside the band its section owns. The upper bound is four sections at '
  'the Paper pattern screen''s own maximum of 200 a section, not the 55 of any '
  'one exam pattern.';
