#!/usr/bin/env tsx
/**
 * Renders the plain-text source papers in docs/ to PDF, so there is always a
 * known-good file to test the extractor against.
 *
 * Note: a PDF written by a library extracts more cleanly than one exported
 * from Word or Google Docs. This proves the pipeline works; it does not prove
 * the admin's own export will. For that, run an export of your own through
 * `npm run parse`.
 */
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import PDFDocument from 'pdfkit'

const PAGE_MARGIN = 54
const BODY_SIZE = 10.5
const MONO_SIZE = 9.5

/** Table rows and ASCII layout need a fixed pitch or the columns collapse. */
function isPreformatted(line: string): boolean {
  return /\s{3,}\S/.test(line)
}

async function render(srcPath: string, outPath: string, heading: string) {
  const src = await readFile(srcPath, 'utf8')
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, autoFirstPage: true })
  const stream = createWriteStream(outPath)
  doc.pipe(stream)

  doc.font('Helvetica-Bold').fontSize(13).text(heading)
  doc.moveDown(0.6)

  const width = doc.page.width - PAGE_MARGIN * 2

  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') { doc.moveDown(0.45); continue }

    if (isPreformatted(line)) {
      doc.font('Courier').fontSize(MONO_SIZE).text(line, { width, lineBreak: false })
      continue
    }
    const isStructural = /^#/.test(line)
    const isDirective = /^(DATE|TITLE|DURATION|MARKS|NEGATIVE|ANS|SOL|TAG|DIFF)\s*:/.test(line)
    const isQuestion = /^Q\s*\d/.test(line)

    doc
      .font(isStructural || isQuestion ? 'Helvetica-Bold' : isDirective ? 'Courier' : 'Helvetica')
      .fontSize(isDirective ? MONO_SIZE : BODY_SIZE)
      .text(line, { width })
  }

  doc.end()
  await once(stream, 'finish')
  console.log(`wrote ${outPath}`)
}

const TEMPLATE = `#TEST
DATE: YYYY-MM-DD
TITLE: Daily Mock NNN

#SECTION: QUANT
DURATION: 12
MARKS: 1
NEGATIVE: 0.25

Q1. Question text goes here on one line, or wrapped over several.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: B
SOL: Worked explanation. Optional but strongly recommended.
TAG: Topic-Name
DIFF: Easy

Q2. ...repeat to Q15 for this section.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: A

#DIRECTIONS: Q6-Q10
Use a directions block for anything shared by several questions: a reading
passage, a data-interpretation table, or a seating puzzle. It attaches to
every question in the range.

Year        Column A    Column B
2024              12          18
2025              15          24
#ENDDIRECTIONS

#SECTION: REASONING
DURATION: 12

Q16. ...Q16 to Q30 go here.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: C

#SECTION: ENGLISH
DURATION: 9

Q31. ...Q31 to Q40 go here.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: D

#SECTION: PK
DURATION: 12

Q41. ...Q41 to Q55 go here.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: E

#ENDTEST
`

async function main() {
  const { writeFile } = await import('node:fs/promises')
  await writeFile('docs/template.txt', TEMPLATE)
  await render('docs/sample.txt', 'docs/sample.pdf', 'Preppy — Daily Mock 001 — 26 September 2026')
  await render('docs/template.txt', 'docs/template.pdf', 'Preppy — paper template')
}

main().catch((e) => { console.error(e); process.exit(1) })
