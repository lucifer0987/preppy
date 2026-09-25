import {
  FORMAT_NAME,
  FORMAT_VERSION,
  OPTION_LABELS,
  PATTERN,
  SECTION_CODES,
  TOTAL_QUESTIONS,
  type Issue,
  type OptionLabel,
  type Paper,
  type SectionCode,
} from './types'
import { describeJsonError, repairJson, type Repair } from './json-repair'

/**
 * Reads and validates a paper in the fixed JSON format.
 *
 * Validation is hand-written rather than schema-driven so that every message
 * names the exact path and says what to do about it. format/schema.json
 * mirrors these rules for editor tooling; tests keep the two in step.
 */

export interface ReadOptions {
  availableImages?: string[]
  takenDates?: string[]
}

export interface ReadResult {
  paper: Paper | null
  issues: Issue[]
  repairs: Repair[]
}

const MAX_OPTION_CHARS = 300
const MIN_QUESTION_CHARS = 10

export function readPaper(rawText: string, opts: ReadOptions = {}): ReadResult {
  const issues: Issue[] = []
  const err = (path: string | null, code: string, message: string, excerpt?: string) =>
    issues.push({ severity: 'error', path, code, message, ...(excerpt ? { excerpt } : {}) })
  const warn = (path: string | null, code: string, message: string) =>
    issues.push({ severity: 'warning', path, code, message })

  const { json, repairs } = repairJson(rawText)

  if (!json.trim().startsWith('{')) {
    err(null, 'NOT_JSON',
      'No JSON object was found in this file. The paper must contain a single JSON object in the fixed format — see format/README.md.')
    return { paper: null, issues, repairs }
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (e) {
    const d = describeJsonError(e, json)
    err(null, 'JSON_INVALID', `The JSON could not be read: ${d.message}`, d.excerpt)
    return { paper: null, issues, repairs }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    err(null, 'NOT_AN_OBJECT', 'The top level of the file must be a JSON object, not an array or a value.')
    return { paper: null, issues, repairs }
  }
  const doc = data as Record<string, unknown>

  // ---- envelope
  if (doc['format'] !== FORMAT_NAME) {
    err('format', 'FORMAT_WRONG',
      `"format" must be "${FORMAT_NAME}", got ${JSON.stringify(doc['format']) ?? 'nothing'}.`)
  }
  if (doc['version'] !== FORMAT_VERSION) {
    err('version', 'VERSION_WRONG',
      `"version" must be ${FORMAT_VERSION}, got ${JSON.stringify(doc['version']) ?? 'nothing'}.`)
  }

  const date = doc['date']
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    err('date', 'DATE_MALFORMED', `"date" must be a string in YYYY-MM-DD form, got ${JSON.stringify(date)}.`)
  } else if (Number.isNaN(Date.parse(date))) {
    err('date', 'DATE_INVALID', `"date" ${date} is not a real calendar date.`)
  } else if (opts.takenDates?.includes(date)) {
    err('date', 'DATE_TAKEN', `A paper is already published for ${date}. Pick another date.`)
  }
  if (doc['title'] !== undefined && typeof doc['title'] !== 'string') {
    err('title', 'TITLE_TYPE', '"title" must be a string when present.')
  }

  // ---- sections
  const sections = doc['sections']
  if (!Array.isArray(sections)) {
    err('sections', 'SECTIONS_MISSING', '"sections" must be an array of four section objects.')
    return { paper: null, issues, repairs }
  }

  const seenCodes: SectionCode[] = []
  const allNumbers: { n: number; path: string }[] = []
  const referencedImages = new Set<string>()
  let total = 0

  sections.forEach((rawSection, si) => {
    const sp = `sections[${si}]`
    if (typeof rawSection !== 'object' || rawSection === null) {
      err(sp, 'SECTION_TYPE', 'Each entry in "sections" must be an object.')
      return
    }
    const s = rawSection as Record<string, unknown>
    const code = s['code']
    if (typeof code !== 'string' || !SECTION_CODES.includes(code as SectionCode)) {
      err(`${sp}.code`, 'SECTION_UNKNOWN',
        `"code" must be one of ${SECTION_CODES.join(', ')}, got ${JSON.stringify(code)}.`)
      return
    }
    const sc = code as SectionCode
    if (seenCodes.includes(sc)) err(`${sp}.code`, 'SECTION_DUPLICATE', `Section ${sc} appears more than once.`)
    seenCodes.push(sc)

    for (const [key, min, max] of [['durationMinutes', 1, 180], ['marksCorrect', 0.01, 10], ['marksNegative', 0, 10]] as const) {
      const v = s[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        err(`${sp}.${key}`, 'NUMBER_TYPE', `"${key}" must be a number, got ${JSON.stringify(v)}.`)
      } else if (v < min || v > max) {
        err(`${sp}.${key}`, 'NUMBER_RANGE', `"${key}" is ${v}, outside the allowed ${min}-${max}.`)
      }
    }

    // ---- questions
    const questions = s['questions']
    if (!Array.isArray(questions)) {
      err(`${sp}.questions`, 'QUESTIONS_MISSING', `Section ${sc} has no "questions" array.`)
      return
    }
    const expected = PATTERN[sc].questions
    if (questions.length !== expected) {
      err(`${sp}.questions`, 'SECTION_COUNT',
        `Section ${sc} has ${questions.length} question(s); the pattern expects ${expected}.`)
    }
    total += questions.length

    questions.forEach((rawQ, qi) => {
      const qp = `${sp}.questions[${qi}]`
      if (typeof rawQ !== 'object' || rawQ === null) {
        err(qp, 'QUESTION_TYPE', 'Each question must be an object.')
        return
      }
      const q = rawQ as Record<string, unknown>

      const number = q['number']
      if (typeof number !== 'number' || !Number.isInteger(number)) {
        err(`${qp}.number`, 'NUMBER_MISSING', `"number" must be a whole number, got ${JSON.stringify(number)}.`)
      } else {
        allNumbers.push({ n: number, path: `${qp}.number` })
        const band = PATTERN[sc]
        if (number < band.from || number > band.to) {
          err(`${qp}.number`, 'NUMBER_OUT_OF_BAND',
            `Q${number} is in section ${sc}, which must hold Q${band.from}-Q${band.to}.`)
        }
      }

      const text = q['text']
      if (typeof text !== 'string') {
        err(`${qp}.text`, 'TEXT_MISSING', '"text" must be a string.')
      } else if (text.trim().length < MIN_QUESTION_CHARS) {
        err(`${qp}.text`, 'TEXT_EMPTY',
          `Question text is only ${text.trim().length} characters. This usually means the PDF text layer was lost.`)
      }

      // options
      // `present` is hoisted so the answer can still be checked when the
      // options are missing entirely. Reporting one error at a time would make
      // the admin fix, re-run, and only then discover the next problem.
      let present: string[] = []
      const options = q['options']
      if (typeof options !== 'object' || options === null || Array.isArray(options)) {
        err(`${qp}.options`, 'OPTIONS_MISSING', '"options" must be an object keyed A to E.')
      } else {
        const o = options as Record<string, unknown>
        const keys = Object.keys(o)
        const bad = keys.filter((k) => !OPTION_LABELS.includes(k as OptionLabel))
        if (bad.length) {
          err(`${qp}.options`, 'OPTION_LABEL_INVALID',
            `Option key(s) ${bad.join(', ')} are not A-E.`)
        }
        const good = keys.filter((k) => OPTION_LABELS.includes(k as OptionLabel))
        present = good
        if (good.length < 2) {
          err(`${qp}.options`, 'OPTION_TOO_FEW', `Only ${good.length} option(s); at least 2 are required.`)
        } else if (good.length < 5) {
          warn(`${qp}.options`, 'OPTION_UNDER_FIVE', `${good.length} options. Real IBPS questions carry 5.`)
        }
        // Options must be contiguous from A, so the palette and keyboard keys line up.
        const ordered = OPTION_LABELS.slice(0, good.length)
        const missing = ordered.filter((l) => !good.includes(l))
        if (missing.length) {
          err(`${qp}.options`, 'OPTION_NOT_CONTIGUOUS',
            `Options must run A, B, C... with no gaps. Missing ${missing.join(', ')}.`)
        }
        for (const k of good) {
          const v = o[k]
          if (typeof v !== 'string' || v.trim() === '') {
            err(`${qp}.options.${k}`, 'OPTION_EMPTY', `Option ${k} has no text.`)
          } else if (v.length > MAX_OPTION_CHARS) {
            warn(`${qp}.options.${k}`, 'OPTION_LONG',
              `Option ${k} is ${v.length} characters; over ${MAX_OPTION_CHARS} will crowd the option card.`)
          }
        }
      }

      // answer — checked independently of the options above
      const answer = q['answer']
      if (typeof answer !== 'string' || !OPTION_LABELS.includes(answer as OptionLabel)) {
        err(`${qp}.answer`, 'ANSWER_MISSING',
          `"answer" must be one of A-E, got ${JSON.stringify(answer)}.`)
      } else if (present.length && !present.includes(answer)) {
        err(`${qp}.answer`, 'ANSWER_NOT_AN_OPTION',
          `"answer" is ${answer} but there is no option ${answer} (present: ${present.join(', ')}).`)
      }

      for (const [key, code2] of [['solution', 'SOLUTION_MISSING'], ['tag', 'TAG_MISSING'], ['difficulty', 'DIFFICULTY_MISSING']] as const) {
        const v = q[key]
        if (v === undefined || v === '') warn(`${qp}.${key}`, code2, `No "${key}".`)
        else if (typeof v !== 'string') err(`${qp}.${key}`, 'FIELD_TYPE', `"${key}" must be a string.`)
      }
      const diff = q['difficulty']
      if (typeof diff === 'string' && diff !== '' && !['Easy', 'Medium', 'Hard'].includes(diff)) {
        err(`${qp}.difficulty`, 'DIFFICULTY_INVALID', `"difficulty" must be Easy, Medium or Hard, got ${JSON.stringify(diff)}.`)
      }

      collectImages(q['images'], `${qp}.images`, referencedImages, err)
    })

    // ---- directions
    const directions = s['directions']
    if (directions !== undefined) {
      if (!Array.isArray(directions)) {
        err(`${sp}.directions`, 'DIRECTIONS_TYPE', '"directions" must be an array when present.')
      } else {
        directions.forEach((rawD, di) => {
          const dp = `${sp}.directions[${di}]`
          if (typeof rawD !== 'object' || rawD === null) {
            err(dp, 'DIRECTIONS_TYPE', 'Each directions block must be an object.')
            return
          }
          const d = rawD as Record<string, unknown>
          const from = d['from']
          const to = d['to']
          if (typeof from !== 'number' || typeof to !== 'number' || !Number.isInteger(from) || !Number.isInteger(to)) {
            err(dp, 'DIRECTIONS_RANGE_TYPE', '"from" and "to" must be whole question numbers.')
            return
          }
          if (from > to) {
            err(dp, 'DIRECTIONS_RANGE_INVERTED', `Range Q${from}-Q${to} runs backwards.`)
          }
          const covered = (questions as unknown[]).filter((qq) => {
            const n = (qq as Record<string, unknown>)?.['number']
            return typeof n === 'number' && n >= from && n <= to
          }).length
          const want = to - from + 1
          if (covered !== want) {
            err(dp, 'DIRECTIONS_RANGE_UNMATCHED',
              `Range Q${from}-Q${to} covers ${want} question(s) but ${covered} were found in section ${sc}.`)
          }
          if (typeof d['text'] !== 'string' || (d['text'] as string).trim() === '') {
            err(`${dp}.text`, 'DIRECTIONS_TEXT_MISSING', 'A directions block needs "text".')
          }
          const table = d['table']
          if (table !== undefined) {
            if (typeof table !== 'object' || table === null || Array.isArray(table)) {
              err(`${dp}.table`, 'TABLE_TYPE', '"table" must be an object with "headers" and "rows".')
            } else {
              const t = table as Record<string, unknown>
              const headers = t['headers']
              const rows = t['rows']
              if (!Array.isArray(headers) || !headers.every((h) => typeof h === 'string')) {
                err(`${dp}.table.headers`, 'TABLE_HEADERS', '"headers" must be an array of strings.')
              } else if (!Array.isArray(rows)) {
                err(`${dp}.table.rows`, 'TABLE_ROWS', '"rows" must be an array of arrays of strings.')
              } else {
                rows.forEach((r, ri) => {
                  if (!Array.isArray(r) || !r.every((c) => typeof c === 'string')) {
                    err(`${dp}.table.rows[${ri}]`, 'TABLE_ROW_TYPE', 'Each row must be an array of strings.')
                  } else if (r.length !== headers.length) {
                    err(`${dp}.table.rows[${ri}]`, 'TABLE_ROW_WIDTH',
                      `Row has ${r.length} cell(s) but there are ${headers.length} headers.`)
                  }
                })
              }
            }
          }
          collectImages(d['images'], `${dp}.images`, referencedImages, err)
        })
      }
    }
  })

  for (const code of SECTION_CODES) {
    if (!seenCodes.includes(code)) err('sections', 'SECTION_MISSING', `Section ${code} is missing from the paper.`)
  }

  // ---- numbering across the paper
  const seen = new Map<number, string>()
  for (const { n, path } of allNumbers) {
    if (seen.has(n)) err(path, 'QUESTION_DUPLICATE', `Question number Q${n} is used more than once.`)
    else seen.set(n, path)
  }
  const sorted = [...seen.keys()].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (cur !== prev + 1) {
      err(seen.get(cur) ?? null, 'QUESTION_GAP',
        `Question numbers jump from Q${prev} to Q${cur}. ${cur - prev - 1} question(s) are missing.`)
    }
  }
  if (total !== TOTAL_QUESTIONS) {
    err('sections', 'TOTAL_COUNT', `The paper has ${total} questions; the pattern expects ${TOTAL_QUESTIONS}.`)
  }

  // ---- images
  const have = new Set(opts.availableImages ?? [])
  for (const ref of referencedImages) {
    if (!have.has(ref)) {
      err(null, 'IMAGE_MISSING', `Image "${ref}" is referenced but was not uploaded with the paper.`)
    }
  }

  const publishable = !issues.some((i) => i.severity === 'error')
  return { paper: publishable ? (doc as unknown as Paper) : null, issues, repairs }
}

function collectImages(
  v: unknown,
  path: string,
  into: Set<string>,
  err: (p: string | null, c: string, m: string) => void,
) {
  if (v === undefined) return
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    err(path, 'IMAGES_TYPE', '"images" must be an array of file names.')
    return
  }
  for (const name of v) into.add(name)
}

export function summarise(issues: Issue[]) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return { errors, warnings, publishable: errors.length === 0 }
}
