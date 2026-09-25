#!/usr/bin/env tsx
/**
 * Builds the format kit in format/:
 *   template.json / template.pdf  a fill-in skeleton with correct numbering
 *   sample.pdf                    sample.json rendered the way a real paper arrives
 *
 * The JSON is rendered with wrapping ON, so the sample PDF reproduces the one
 * thing that actually breaks JSON in a PDF: long string values split across
 * lines. If the checker can read this file, the repair layer works.
 */
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import PDFDocument from 'pdfkit'
import { OPTION_LABELS, PATTERN, SECTION_CODES, TOTAL_MINUTES, TOTAL_QUESTIONS } from '../lib/types'

const MARGIN = 48
const SIZE = 8.5

async function renderJsonToPdf(jsonPath: string, outPath: string, heading: string) {
  const text = await readFile(jsonPath, 'utf8')
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true })
  const stream = createWriteStream(outPath)
  doc.pipe(stream)

  doc.font('Helvetica-Bold').fontSize(11).text(heading)
  doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text('Preppy paper, fixed JSON format v1. Do not edit this page; edit the .json and re-export.')
  doc.moveDown(0.5).fillColor('#000')

  const width = doc.page.width - MARGIN * 2
  doc.font('Courier').fontSize(SIZE)
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line === '') { doc.moveDown(0.3); continue }
    doc.text(line, { width })
  }

  doc.end()
  await once(stream, 'finish')
  console.log(`wrote ${outPath}`)
}

/** A complete, valid skeleton: right sections, right counts, right numbering. */
function buildTemplate() {
  const placeholder = (n: number) => ({
    number: n,
    text: `Replace this with the text of question ${n}.`,
    options: Object.fromEntries(OPTION_LABELS.map((l) => [l, `Replace with option ${l}`])),
    answer: 'A',
    solution: 'Replace with the worked explanation. Optional but recommended.',
    tag: 'Topic-Name',
    difficulty: 'Easy',
  })

  return {
    format: 'preppy-paper',
    version: 1,
    date: '2026-01-01',
    title: 'Daily Mock NNN',
    sections: SECTION_CODES.map((code) => {
      const band = PATTERN[code]
      const section: Record<string, unknown> = {
        code,
        durationMinutes: band.minutes,
        marksCorrect: 1,
        marksNegative: 0.25,
      }
      if (code === 'QUANT') {
        section['directions'] = [{
          from: 6,
          to: 10,
          text: 'Optional. Use a directions block for anything several questions share: a reading passage, a data table, or a puzzle. Delete this block if the section does not need one.',
          table: {
            headers: ['Year', 'Column A', 'Column B'],
            rows: [['2024', '12', '18'], ['2025', '15', '24']],
          },
        }]
      }
      section['questions'] = Array.from({ length: band.questions }, (_, i) => placeholder(band.from + i))
      return section
    }),
  }
}

async function main() {
  const template = buildTemplate()
  await writeFile('format/template.json', JSON.stringify(template, null, 2) + '\n')
  const n = template.sections.reduce((a, s) => a + (s['questions'] as unknown[]).length, 0)
  console.log(`wrote format/template.json - ${n} placeholder questions, Q1-Q${n}`)

  await renderJsonToPdf('format/sample.json', 'format/sample.pdf',
    `Preppy - Daily Mock 001 - 26 September 2026 (${TOTAL_QUESTIONS} questions, ${TOTAL_MINUTES} minutes)`)
  await renderJsonToPdf('format/template.json', 'format/template.pdf',
    'Preppy - paper template - fill in and export to PDF')
  await renderJsonToPdf('format/paper-002.json', 'format/paper-002.pdf',
    'Preppy - Daily Mock 002 - 27 September 2026 (55 questions, 45 minutes)')
}

main().catch((e) => { console.error(e); process.exit(1) })
