# Preppy paper format — one-page cheatsheet

Write the paper in any editor, then **export to PDF** (File → Export/Save as PDF).
Do not scan or photograph it — a scanned PDF has no text layer and will be rejected.

Check it before you publish:

```
npm run parse -- path/to/your-paper.pdf
```

---

## Skeleton

```
#TEST
DATE: 2026-09-26          <- the night it goes live, YYYY-MM-DD
TITLE: Daily Mock 042     <- optional

#SECTION: QUANT
DURATION: 12

Q1. Question text.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: B
SOL: Worked explanation.
TAG: Speed-Time-Distance
DIFF: Easy

... Q2 to Q15 ...

#SECTION: REASONING       ... Q16 to Q30, DURATION: 12
#SECTION: ENGLISH         ... Q31 to Q40, DURATION: 9
#SECTION: PK              ... Q41 to Q55, DURATION: 12

#ENDTEST
```

## The pattern

| Section | Questions | Numbers | Minutes |
|---|---|---|---|
| `QUANT` | 15 | Q1–Q15 | 12 |
| `REASONING` | 15 | Q16–Q30 | 12 |
| `ENGLISH` | 10 | Q31–Q40 | 9 |
| `PK` | 15 | Q41–Q55 | 12 |
| **Total** | **55** | | **45** |

Marking is +1 correct, −0.25 wrong, 0 unattempted.

## Shared passages, tables and puzzles

Anything several questions depend on goes in a directions block. It attaches to
every question in the range and shows above each of them during the test.

```
#DIRECTIONS: Q6-Q10
Study the table below and answer the questions that follow.

Year        Java    Python    DBMS
2024          15        24      12
2025          18        30      15
#ENDDIRECTIONS
```

Use this for reading comprehension, cloze tests, DI sets and seating puzzles.
Keep table columns aligned with spaces and the checker will preserve them.

## Diagrams

Reference an image and upload the file alongside the PDF:

```
Q12. Study the figure and answer. [IMG: figure-3.png]
```

## Every directive

| Line | Where | Required | Notes |
|---|---|---|---|
| `#TEST` / `#ENDTEST` | top / bottom | yes | wraps the whole paper |
| `DATE:` | after `#TEST` | yes | `YYYY-MM-DD` |
| `TITLE:` | after `#TEST` | no | defaults to the date |
| `#SECTION:` | before each section | yes | `QUANT` `REASONING` `ENGLISH` `PK` |
| `DURATION:` | under a section | no | minutes; defaults to the pattern |
| `MARKS:` / `NEGATIVE:` | under a section | no | default 1 and 0.25 |
| `Q1.` | question start | yes | numbered **1–55 straight through**, not per section |
| `A)` … `E)` | after the stem | yes | `A)`, `A.` and `(A)` all work |
| `ANS:` | after the options | yes | one letter |
| `SOL:` | after `ANS:` | no | can run over several lines |
| `TAG:` | anywhere in the block | no | topic, used to track weak areas |
| `DIFF:` | anywhere in the block | no | `Easy` `Medium` `Hard` |
| `[IMG: file]` | anywhere | no | upload the file too |
| `#DIRECTIONS: Qa-Qb` / `#ENDDIRECTIONS` | before the group | no | shared passage or table |

## What will stop you publishing

Wrong number of questions in a section · a missing or unreadable `ANS:` · an
answer key that is not one of the options · duplicate question numbers · **a gap
in the numbering** (this nearly always means a question was lost on export) · an
image referenced but not uploaded · a `#DIRECTIONS` range pointing at questions
that do not exist · an unknown section name · a date that already has a paper.

## What is only a warning

No `SOL:` · no `TAG:` · no `DIFF:` · fewer than five options · a very long option.
These publish fine.

## Habits that avoid trouble

- Number questions **1 to 55 continuously**. Do not restart at 1 in each section.
- Put each option on its own line.
- Leave a blank line between questions.
- Export to PDF; never scan or screenshot.
- Run `npm run parse` before you publish. It takes two seconds and reads the
  paper exactly the way the site will.
