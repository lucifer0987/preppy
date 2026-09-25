import {
  DEFAULT_PATTERN,
  SECTION_CODES,
  type Issue,
  type ParsedTest,
} from './types.js'

/**
 * Semantic validation of a parsed paper (PRD §6.9.1).
 *
 * Errors block publication; warnings do not. The split matters: an admin at
 * 21:50 needs to know instantly whether a paper is publishable or broken.
 */

export interface ValidateOptions {
  /** Image filenames the admin uploaded alongside the document. */
  availableImages?: string[]
  /** Dates that already hold a published test. */
  takenDates?: string[]
  /** Expected questions per section; defaults to the PRD pattern. */
  expectedCounts?: Partial<Record<string, number>>
}

const MAX_OPTION_CHARS = 300
const MIN_QUESTION_CHARS = 10

export function validateTest(test: ParsedTest, opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = []
  const add = (severity: Issue['severity'], line: number | null, code: string, message: string, excerpt?: string) =>
    issues.push({ severity, line, code, message, ...(excerpt ? { excerpt: excerpt.slice(0, 120) } : {}) })

  // ---- document level
  if (!test.date) {
    add('error', null, 'DATE_MISSING', 'The paper has no DATE. Add "DATE: YYYY-MM-DD" under #TEST.')
  } else if (opts.takenDates?.includes(test.date)) {
    add('error', null, 'DATE_TAKEN', `A test is already published for ${test.date}. Pick another date.`)
  }

  const present = test.sections.map((s) => s.code)
  for (const code of SECTION_CODES) {
    if (!present.includes(code)) {
      add('error', null, 'SECTION_MISSING', `Section ${code} is missing from the paper.`)
    }
  }

  // ---- per section
  let total = 0
  for (const section of test.sections) {
    const expected = opts.expectedCounts?.[section.code] ?? DEFAULT_PATTERN[section.code].questions
    const actual = section.questions.length
    total += actual
    if (actual !== expected) {
      add('error', section.line, 'SECTION_COUNT',
        `Section ${section.code} has ${actual} question(s) but the pattern expects ${expected}.`)
    }

    for (const q of section.questions) {
      const where = `Q${q.number}`

      if (q.text.length < MIN_QUESTION_CHARS) {
        add('error', q.line, 'QUESTION_TEXT_EMPTY',
          `${where} has little or no question text (${q.text.length} chars). This usually means the PDF text layer was lost.`,
          q.text)
      }

      // options
      const labels = q.options.map((o) => o.label)
      const dupes = labels.filter((l, i) => labels.indexOf(l) !== i)
      if (dupes.length) {
        add('error', q.line, 'OPTION_DUPLICATE',
          `${where} repeats option label(s) ${[...new Set(dupes)].join(', ')}.`)
      }
      if (q.options.length < 2) {
        add('error', q.line, 'OPTION_TOO_FEW', `${where} has ${q.options.length} option(s); at least 2 are required.`)
      } else if (q.options.length > 5) {
        add('error', q.line, 'OPTION_TOO_MANY', `${where} has ${q.options.length} options; at most 5 are allowed.`)
      } else if (q.options.length < 5) {
        add('warning', q.line, 'OPTION_UNDER_FIVE',
          `${where} has ${q.options.length} options. Real IBPS questions carry 5.`)
      }
      for (const o of q.options) {
        if (o.text.length === 0 && o.imagePaths.length === 0) {
          add('error', o.line, 'OPTION_EMPTY', `${where} option ${o.label} has no text.`)
        }
        if (o.text.length > MAX_OPTION_CHARS) {
          add('warning', o.line, 'OPTION_LONG',
            `${where} option ${o.label} is ${o.text.length} chars; over ${MAX_OPTION_CHARS} will crowd the option card.`)
        }
      }

      // answer key
      if (!q.correctOption) {
        add('error', q.line, 'ANS_MISSING', `${where} has no answer key. Add "ANS: X".`)
      } else if (!labels.includes(q.correctOption)) {
        add('error', q.line, 'ANS_NOT_AN_OPTION',
          `${where} has ANS: ${q.correctOption} but no option ${q.correctOption} exists (options: ${labels.join(', ') || 'none'}).`)
      }

      if (!q.solution) add('warning', q.line, 'SOL_MISSING', `${where} has no SOL: explanation.`)
      if (!q.tag) add('warning', q.line, 'TAG_MISSING', `${where} has no TAG: topic.`)
      if (!q.difficulty) add('warning', q.line, 'DIFF_MISSING', `${where} has no DIFF: rating.`)
    }
  }

  // ---- numbering across the whole paper
  const numbers = test.sections.flatMap((s) => s.questions.map((q) => ({ n: q.number, line: q.line })))
  const seen = new Map<number, number>()
  for (const { n, line } of numbers) {
    if (seen.has(n)) {
      add('error', line, 'QUESTION_DUPLICATE', `Question number Q${n} appears more than once (also on line ${seen.get(n)}).`)
    } else {
      seen.set(n, line)
    }
  }
  const sorted = [...seen.keys()].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (cur !== prev + 1) {
      // A gap almost always means a question was lost in extraction, not that
      // the author skipped a number. Block rather than warn.
      add('error', seen.get(cur) ?? null, 'QUESTION_GAP',
        `Question numbers jump from Q${prev} to Q${cur}. ${cur - prev - 1} question(s) are missing — check the PDF text layer.`)
    }
  }

  const expectedTotal = Object.values(opts.expectedCounts ?? {}).length
    ? Object.values(opts.expectedCounts as Record<string, number>).reduce((a, b) => a + b, 0)
    : Object.values(DEFAULT_PATTERN).reduce((a, s) => a + s.questions, 0)
  if (total !== expectedTotal) {
    add('error', null, 'TOTAL_COUNT', `The paper has ${total} questions; the pattern expects ${expectedTotal}.`)
  }

  // ---- images
  if (test.referencedImages.length) {
    const have = new Set(opts.availableImages ?? [])
    for (const ref of test.referencedImages) {
      if (!have.has(ref)) {
        add('error', null, 'IMAGE_MISSING',
          `Image "${ref}" is referenced but was not uploaded with the paper.`)
      }
    }
  }

  // ---- duration sanity
  const totalMinutes = test.sections.reduce((a, s) => a + s.durationMinutes, 0)
  const patternMinutes = Object.values(DEFAULT_PATTERN).reduce((a, s) => a + s.minutes, 0)
  if (test.sections.length === SECTION_CODES.length && totalMinutes !== patternMinutes) {
    add('warning', null, 'DURATION_TOTAL',
      `Section durations add up to ${totalMinutes} minutes, not the usual ${patternMinutes}.`)
  }

  return issues
}

export function summarise(issues: Issue[]) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return { errors, warnings, publishable: errors.length === 0 }
}
