# The Preppy paper format

One paper per night, as **a single JSON file**.

The format is fixed. The checker reads this and nothing else.

```
npm run check -- your-paper.json
```

Exit `0` publishable, `1` blocking errors, `2` bad usage.

---

## Files here

| File | What it is |
|---|---|
| `template.json` | Fill-in skeleton. All 55 questions, numbered correctly, ready to overwrite |
| `sample.json` | A complete worked paper: DI table, seating puzzle, RC passage. **Copy this one** |
| `schema.json` | JSON Schema. Point your editor at it for live validation while you type |

Two ways in:

- **Copy `sample.json`** and swap the content question by question. Everything
  is already in place — the numbering, the bands, a table, a puzzle, a passage.
  This is the quicker route and the one to prefer.
- **Start from `template.json`** if you would rather fill a blank skeleton. The
  55 questions are numbered correctly; overwrite the placeholder text. The
  checker refuses any placeholder left in (see below), so an unedited
  template can never go live by mistake.

Either way: run the checker on it, then upload the `.json`.

---

## Shape

```json
{
  "format": "preppy-paper",
  "version": 1,
  "date": "2026-09-26",
  "title": "Daily Mock 001",
  "sections": [
    {
      "code": "QUANT",
      "durationMinutes": 12,
      "marksCorrect": 1,
      "marksNegative": 0.25,
      "directions": [
        {
          "from": 6,
          "to": 10,
          "text": "Study the following table and answer the questions that follow.",
          "table": {
            "headers": ["Year", "Java", "Python"],
            "rows": [["2024", "15", "24"], ["2025", "18", "30"]]
          }
        }
      ],
      "questions": [
        {
          "number": 1,
          "text": "A train 150 m long crosses a pole in 15 seconds. Find its speed.",
          "options": {
            "A": "30 km/h",
            "B": "36 km/h",
            "C": "40 km/h",
            "D": "45 km/h",
            "E": "None of these"
          },
          "answer": "B",
          "solution": "Speed = 150/15 = 10 m/s = 36 km/h.",
          "tag": "Speed-Time-Distance",
          "difficulty": "Easy"
        }
      ]
    }
  ]
}
```

## The pattern

Four sections, in this order, with these numbers. Nothing else validates: a
fifth section, or the right four in a different order, is a blocking error.

| `code` | Section | Questions | Numbers | Minutes |
|---|---|---|---|---|
| `QUANT` | Quantitative Aptitude | 15 | 1–15 | 12 |
| `REASONING` | Reasoning Ability | 15 | 16–30 | 12 |
| `ENGLISH` | English Language | 10 | 31–40 | 9 |
| `PK` | Professional Knowledge (CSE) | 15 | 41–55 | 12 |
| | **Total** | **55** | | **45** |

Question numbers run **1 to 55 straight through the paper**, not 1 to 15 per
section. Each section must hold exactly its own band.

Marking is +1 correct, −0.25 wrong, 0 unattempted.

## Fields

### Document

| Field | Required | Notes |
|---|---|---|
| `format` | yes | Always the string `"preppy-paper"` |
| `version` | yes | Always `1` |
| `date` | yes | `YYYY-MM-DD`, the night it goes live. Must be a real day: `2026-02-31` is refused |
| `title` | no | Defaults to the date |
| `sections` | yes | Exactly four |

### Section

| Field | Required | Notes |
|---|---|---|
| `code` | yes | `QUANT` `REASONING` `ENGLISH` `PK` |
| `durationMinutes` | no | Defaults to the pattern |
| `marksCorrect` | no | Default `1` |
| `marksNegative` | no | Default `0.25` |
| `directions` | no | Shared passages, tables, puzzles |
| `questions` | yes | Exactly the pattern count |

### Question

| Field | Required | Notes |
|---|---|---|
| `number` | yes | Must fall inside the section's band |
| `text` | yes | At least 10 characters, not counting spaces at either end |
| `options` | yes | Object keyed `A`–`E`, contiguous from `A`, 2 to 5 entries |
| `answer` | yes | One of the keys present in `options` |
| `solution` | no | Shown in the archive after midnight |
| `tag` | no | Topic, used to track weak areas |
| `difficulty` | no | `Easy` `Medium` `Hard`. Leave it out rather than `""` |
| `images` | no | File names of images uploaded with the paper — see [Images](#images) |

### Directions

For anything several questions share: a reading passage, a DI table, a seating
puzzle. It attaches to questions `from`..`to` inclusive and shows above each of
them during the test.

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | yes | Inclusive range, inside the same section. Ranges may not overlap |
| `text` | yes | The passage or instruction |
| `table` | no | `headers` (at least one) plus `rows`, both arrays of strings |
| `images` | no | File names — see [Images](#images) |

A question shows at most one directions block, so two blocks covering the same
question are an error: the second would never be seen. Ranges that touch
(`1`–`5` and `6`–`10`) are fine.

**Put tables in `table`, never in `text`.** A table drawn with aligned spaces
loses its columns when rendered in the browser. As structured `headers` and
`rows` it displays correctly.

---

## Only these fields

Every object takes exactly the fields listed above and nothing else. An
unknown key is a blocking error, not ignored: a misspelling such as
`"direction"` for `"directions"` would otherwise drop a whole passage without
a word. The message suggests the field you probably meant.

## Images

For a DI chart, a puzzle diagram or a figure a question needs. List the file
names in `images` on the question or the directions block, then choose the
files in the **Images** box on the upload page, next to the paper.

- Plain names only: letters, digits, `.`, `-`, `_`, ending in `.png`, `.jpg`,
  `.webp` or `.gif`. `di-chart-1.png` works; `DI chart (1).png` does not.
- Under 2 MB each, and 10 MB for the paper and all its images together.
- Every name the paper lists must be uploaded, or the paper will not publish.
  To check locally first: `npm run check -- paper.json --images <folder>`.
- Students can load an image only once the paper opens at 22:00.

Tables still belong in `table`, not in an image: a table stays readable and
searchable, and cannot be the wrong file.

## Plain JSON only

The file is parsed strictly, exactly as written. Nothing is repaired, so:

- **Straight quotes only.** `“` and `”` are not JSON; a word processor's
  autocorrect will insert them. Write the file in a code editor.
- **No trailing commas** after the last item in an object or array.
- **No comments.**

A parse error names the line and column, so it is quick to find.

## What blocks publication

Wrong question count in a section · sections missing, repeated, extra or out of
order · a number outside its section's band · a gap or duplicate in the
numbering · a missing `answer`, or one naming an option that does not exist ·
options that are not contiguous from `A` · question text under 10 characters ·
a `directions` range covering questions that are not there, or overlapping
another · a table with no headers, or a row whose width does not match them ·
an empty `difficulty` · an unknown field anywhere · placeholder text left over
from `template.json` · an image referenced but not uploaded · a date that is not
a real day, or that already has a scheduled paper · sections adding up to more
than 45 minutes · JSON that cannot be read at all.

**A gap in the numbering is an error, not a warning.** It nearly always means a
question was deleted by accident, not that you skipped one on purpose.

## What is only a warning

No `solution` · no `tag` · no `difficulty` · fewer than five options · a very
long option · a date that has already passed (you pick a new night when you
schedule it). These publish fine.

## Habits that avoid trouble

- Start from `sample.json` (or `template.json`); the numbering is already correct.
- Point your editor at `schema.json` and it will catch mistakes as you type.
- Edit in a code editor, not a word processor.
- Run `npm run check` before you publish. It reads the paper exactly the way the
  site will.
