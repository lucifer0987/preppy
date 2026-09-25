# Preppy

Daily exam-simulation platform for IBPS Specialist Officer (IT) aspirants.
See [PRD.md](PRD.md) for the full specification.

**Status:** paper-ingestion pipeline only. No web app yet.

## The paper format

One paper per night, as a single JSON object, delivered as a PDF.
The format is fixed — see **[format/README.md](format/README.md)**.

```bash
npm install
npm run check -- format/sample.pdf     # check a paper
```

Exit `0` publishable, `1` blocking errors, `2` bad usage.

| Path | Purpose |
|---|---|
| `format/README.md` | The format spec, written for whoever makes the papers |
| `format/schema.json` | JSON Schema — point your editor at it for live validation |
| `format/template.json` / `.pdf` | Fill-in skeleton, all 55 questions numbered correctly |
| `format/sample.json` / `.pdf` | A worked paper: DI table, seating puzzle, RC passage |
| `lib/types.ts` | The pattern constants and paper shapes |
| `lib/json-repair.ts` | Repairs what a PDF text layer does to JSON |
| `lib/paper.ts` | Validation: blocking errors vs warnings, each with a path |
| `lib/extract.ts` | PDF text extraction with line reconstruction |
| `scripts/parse.ts` | The checker CLI |
| `scripts/build-format.ts` | Regenerates the template and the sample PDFs |
| `scripts/roundtrip.ts` | Proves a paper survives PDF export unchanged |

## Commands

```bash
npm run check -- <paper.pdf|paper.json>   # validate; add --images <dir> or --json
npm run build:format                      # regenerate format/template.* and sample.pdf
npm test                                  # 36 tests
npx tsx scripts/roundtrip.ts format/sample.json format/sample.pdf
```

## Why JSON-in-a-PDF needs a repair layer

JSON was not designed to survive a word processor. Four things reliably damage
it on the way through a PDF, and `lib/json-repair.ts` fixes all four, reporting
what it had to do rather than changing the paper silently:

- Word and Google Docs autocorrect `"` into `“` and `”`, which breaks JSON outright.
- Long string values wrap across lines; JSON forbids a raw newline in a string.
- Page headers, footers and page numbers land outside the JSON object.
- Autocorrect turns `-0.25` into a Unicode minus.

`format/sample.pdf` needs **75 wrapped-string repairs** before it will parse.
It still round-trips with all **570 fields identical** to `format/sample.json`.

## Known limit

`format/sample.pdf` is rendered by a library, so it extracts a little more
cleanly than a Word or Google Docs export. The pipeline is proven end to end
against it, but **the format is not proven against a real export until one is
run through `npm run check`.**
