# The Preppy paper format

One paper per night, as **a single JSON object**, delivered as a PDF.

The format is fixed. The checker reads this and nothing else.

```
npm run check -- your-paper.pdf
```

Exit `0` publishable, `1` blocking errors, `2` bad usage.

---

## Files here

| File | What it is |
|---|---|
| `template.json` | Fill-in skeleton. All 55 questions, numbered correctly, ready to overwrite |
| `template.pdf` | The same, rendered |
| `sample.json` | A complete worked paper: DI table, seating puzzle, RC passage |
| `sample.pdf` | The same, rendered — this is exactly what a real upload looks like |
| `paper-002.json` | A second complete paper: DI table, floor puzzle, RC passage. **Copy this one** |
| `paper-002.pdf` | The same, rendered |
| `schema.json` | JSON Schema. Point your editor at it for live validation while you type |

Two ways in:

- **Copy `paper-002.json`** and swap the content question by question. Everything
  is already in place — the numbering, the bands, a table, a puzzle, a passage.
  This is the quicker route and the one to prefer.
- **Start from `template.json`** if you would rather fill a blank skeleton. The
  55 questions are numbered correctly; overwrite the placeholder text.

Either way: export to PDF, then run the checker on it.

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

Four sections, in this order, with these numbers. Nothing else validates.

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
| `date` | yes | `YYYY-MM-DD`, the night it goes live |
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
| `text` | yes | At least 10 characters |
| `options` | yes | Object keyed `A`–`E`, contiguous from `A`, 2 to 5 entries |
| `answer` | yes | One of the keys present in `options` |
| `solution` | no | Shown in the archive after midnight |
| `tag` | no | Topic, used to track weak areas |
| `difficulty` | no | `Easy` `Medium` `Hard` |
| `images` | no | File names, uploaded alongside the PDF |

### Directions

For anything several questions share: a reading passage, a DI table, a seating
puzzle. It attaches to questions `from`..`to` inclusive and shows above each of
them during the test.

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | yes | Inclusive range, inside the same section |
| `text` | yes | The passage or instruction |
| `table` | no | `headers` plus `rows`, both arrays of strings |
| `images` | no | File names |

**Put tables in `table`, never in `text`.** A PDF collapses runs of spaces, so a
table drawn with aligned spaces loses its columns on export. As structured
`headers` and `rows` it cannot be damaged.

---

## Why a PDF of JSON needs care

JSON was never meant to survive a word processor. Four things happen to it on
the way through a PDF, and the checker repairs all four — and tells you which
ones it had to apply:

| What happens | Why | Repaired |
|---|---|---|
| `"` becomes `“` and `”` | Word and Google Docs autocorrect | yes |
| A long value splits across two lines | JSON strings cannot contain a raw newline | yes |
| Headers, footers, page numbers appear | They sit outside the JSON object | yes |
| `-0.25` becomes `−0.25` | Autocorrect swaps in a Unicode minus | yes |

`sample.pdf` needs **75 wrapped-string repairs** to be readable. It still comes
back with all 570 fields identical to `sample.json`.

Two things the repair layer cannot fix, so avoid them:

- **Typographic quotes inside your text.** A `“` inside a question stem is
  straightened into a `"`, which ends the string early. Use plain quotes, or
  write the passage without them.
- **A scanned or photographed PDF.** There is no text layer to read and no OCR.
  Always use File → Export as PDF.

## What blocks publication

Wrong question count in a section · a number outside its section's band · a gap
or duplicate in the numbering · a missing `answer`, or one naming an option that
does not exist · options that are not contiguous from `A` · question text under
10 characters · a `directions` range covering questions that are not there · a
table row whose width does not match its headers · an image referenced but not
uploaded · a date that already has a paper · JSON that cannot be read at all.

**A gap in the numbering is an error, not a warning.** It nearly always means a
question was lost on export, not that you skipped one on purpose.

## What is only a warning

No `solution` · no `tag` · no `difficulty` · fewer than five options · a very
long option. These publish fine.

## Habits that avoid trouble

- Start from `template.json`; the numbering is already correct.
- Point your editor at `schema.json` and it will catch mistakes as you type.
- Export to PDF. Never scan, never screenshot.
- Run `npm run check` before you publish. It reads the paper exactly the way the
  site will.
