#!/usr/bin/env tsx
/**
 * Builds format/template.json: a fill-in skeleton with the right sections,
 * counts and numbering.
 *
 * The placeholder strings below are matched exactly by PLACEHOLDERS in
 * lib/paper.ts, which is what stops an unedited template going live. Change
 * one and change the other; tests/format.test.ts fails if they drift.
 */
import { writeFile } from 'node:fs/promises'
import { OPTION_LABELS, PATTERN, SECTION_CODES } from '../lib/types'

/** A complete skeleton: right sections, right counts, right numbering, placeholder text. */
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
}

main().catch((e) => { console.error(e); process.exit(1) })
