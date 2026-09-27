import { OPTION_LABELS, TEMPLATE_DATE, patternBands, type Pattern } from './types'

/**
 * A fill-in skeleton for a paper: the right sections, counts, numbering and
 * marking, with placeholder text everywhere the content goes.
 *
 * The placeholder strings are matched exactly by PLACEHOLDERS in lib/paper.ts,
 * which is what stops an unedited template going live. Change one and change
 * the other; tests/format.test.ts fails if they drift.
 *
 * Pure, and takes the pattern as an argument, so the same builder serves
 * `npm run build:format` (which writes format/template.json from the shipped
 * default) and the admin console's download (which uses the configured one).
 */
export function buildTemplate(pattern: Pattern): Record<string, unknown> {
  const placeholder = (n: number) => ({
    number: n,
    text: `Replace this with the text of question ${n}.`,
    options: Object.fromEntries(OPTION_LABELS.map((l) => [l, `Replace with option ${l}`])),
    answer: 'A',
    solution: 'Replace with the worked explanation. Optional but recommended.',
    tag: 'Topic-Name',
    difficulty: 'Easy',
  })

  const bands = patternBands(pattern)

  return {
    format: 'preppy-paper',
    version: 1,
    date: TEMPLATE_DATE,
    title: 'Daily Mock NNN',
    sections: pattern.map((shape) => {
      const code = shape.code
      const band = bands.find((b) => b.code === code)!
      const section: Record<string, unknown> = {
        code,
        // Stated, not implied. A file that names its own shape validates the
        // same way whatever the default pattern is changed to, and the count
        // still has to match the array, so a lost question is caught either way.
        questionCount: shape.questions,
        durationMinutes: shape.minutes,
        marksCorrect: shape.marksCorrect,
        marksNegative: shape.marksNegative,
      }
      // One worked directions block, to show what they are for. It covers five
      // questions in the middle of the section, so a section too small to spare
      // five simply does not get the example.
      if (code === 'QUANT' && shape.questions >= 10) {
        const from = band.from + 5
        section['directions'] = [{
          from,
          to: from + 4,
          text: 'Optional. Use a directions block for anything several questions share: a reading passage, a data table, or a puzzle. Delete this block if the section does not need one.',
          table: {
            headers: ['Year', 'Column A', 'Column B'],
            rows: [['2024', '12', '18'], ['2025', '15', '24']],
          },
        }]
      }
      section['questions'] = Array.from({ length: shape.questions }, (_, i) => placeholder(band.from + i))
      return section
    }),
  }
}

/** How many questions a built template holds, for the "wrote N questions" line. */
export function templateQuestionCount(template: Record<string, unknown>): number {
  return (template['sections'] as { questions: unknown[] }[])
    .reduce((n, s) => n + s.questions.length, 0)
}
