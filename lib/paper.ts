import { IMAGE_NAME_PATTERN } from './images'
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
import { describeJsonError } from './json-error'

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
  /** Today's IST date. When given, a paper dated earlier is warned about. */
  today?: string
}

/** Every section together must fit the attempt window (lib/time.ts WINDOW). */
const MAX_TOTAL_MINUTES = 45

export interface ReadResult {
  paper: Paper | null
  issues: Issue[]
}

const MAX_OPTION_CHARS = 300
const MIN_QUESTION_CHARS = 10

/**
 * Every key each object may carry. Anything else is an error, as it is in
 * schema.json's additionalProperties: false. Silently ignoring an unknown key
 * is how "direction" instead of "directions" drops a whole passage.
 */
export const FIELDS = {
  document: ['format', 'version', 'date', 'title', 'sections'],
  section: ['code', 'durationMinutes', 'marksCorrect', 'marksNegative', 'directions', 'questions'],
  directions: ['from', 'to', 'text', 'table', 'images'],
  table: ['headers', 'rows'],
  question: ['number', 'text', 'options', 'answer', 'solution', 'tag', 'difficulty', 'images'],
} as const

/**
 * The placeholder strings format/template.json ships with (scripts/build-format.ts
 * writes them). Matched exactly rather than by a loose "Replace..." prefix, so
 * an English question that genuinely begins "Replace with..." is not refused.
 * A test checks that the template trips these and nothing else.
 */
const PLACEHOLDERS: RegExp[] = [
  /^Replace this with the text of question \d+\.$/,
  /^Replace with option [A-E]$/,
  /^Replace with the worked explanation\./,
  /^Optional\. Use a directions block for anything several questions share/,
  /^Topic-Name$/,
  /\bNNN\b/,
]
const isPlaceholder = (v: unknown) => typeof v === 'string' && PLACEHOLDERS.some((re) => re.test(v))

type ErrFn = (path: string | null, code: string, message: string, excerpt?: string) => void
type WarnFn = (path: string | null, code: string, message: string) => void

interface Ctx {
  err: ErrFn
  warn: WarnFn
  images: Set<string>
}

function collector() {
  const issues: Issue[] = []
  const ctx: Ctx = {
    err: (path, code, message, excerpt) =>
      issues.push({ severity: 'error', path, code, message, ...(excerpt ? { excerpt } : {}) }),
    warn: (path, code, message) => issues.push({ severity: 'warning', path, code, message }),
    images: new Set<string>(),
  }
  return { issues, ctx }
}

export function readPaper(rawText: string, opts: ReadOptions = {}): ReadResult {
  const { issues, ctx } = collector()
  const { err } = ctx

  const json = rawText.replace(/^﻿/, '')

  if (!json.trim().startsWith('{')) {
    err(null, 'NOT_JSON',
      'No JSON object was found in this file. The paper must be a single JSON object in the fixed format — see docs/architecture.html, section 7.')
    return { paper: null, issues }
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (e) {
    const d = describeJsonError(e, json)
    err(null, 'JSON_INVALID', `The JSON could not be read: ${d.message}`, d.excerpt)
    return { paper: null, issues }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    err(null, 'NOT_AN_OBJECT', 'The top level of the file must be a JSON object, not an array or a value.')
    return { paper: null, issues }
  }
  const doc = data as Record<string, unknown>

  // ---- envelope
  checkKeys(doc, FIELDS.document, null, err)
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
  } else if (!isCalendarDate(date)) {
    err('date', 'DATE_INVALID', `"date" ${date} is not a real calendar date.`)
  } else if (opts.takenDates?.includes(date)) {
    err('date', 'DATE_TAKEN', `A paper is already published for ${date}. Pick another date.`)
  } else if (opts.today && date < opts.today) {
    ctx.warn('date', 'DATE_PAST',
      `${date} has already passed. It can still be uploaded; choose a new night for it when you schedule it.`)
  }
  if (doc['title'] !== undefined && typeof doc['title'] !== 'string') {
    err('title', 'TITLE_TYPE', '"title" must be a string when present.')
  } else if (isPlaceholder(doc['title'])) {
    placeholderError('title', ['title'], err)
  }

  // ---- sections
  const sections = doc['sections']
  if (!Array.isArray(sections)) {
    err('sections', 'SECTIONS_MISSING', '"sections" must be an array of four section objects.')
    return { paper: null, issues }
  }

  const seenCodes: SectionCode[] = []
  const allNumbers: { n: number; path: string }[] = []
  let total = 0
  let totalMinutes = 0

  sections.forEach((rawSection, si) => {
    const sp = `sections[${si}]`
    if (typeof rawSection !== 'object' || rawSection === null || Array.isArray(rawSection)) {
      err(sp, 'SECTION_TYPE', 'Each entry in "sections" must be an object.')
      return
    }
    const s = rawSection as Record<string, unknown>
    checkKeys(s, FIELDS.section, sp, err)
    const code = s['code']
    if (typeof code !== 'string' || !SECTION_CODES.includes(code as SectionCode)) {
      err(`${sp}.code`, 'SECTION_UNKNOWN',
        `"code" must be one of ${SECTION_CODES.join(', ')}, got ${JSON.stringify(code)}.`)
      return
    }
    const sc = code as SectionCode
    if (seenCodes.includes(sc)) err(`${sp}.code`, 'SECTION_DUPLICATE', `Section ${sc} appears more than once.`)
    seenCodes.push(sc)

    // The test engine runs sections in document order, so the order is part
    // of the pattern, not a matter of taste.
    if (si >= SECTION_CODES.length) {
      err(sp, 'SECTION_EXTRA', `The paper has more than ${SECTION_CODES.length} sections.`)
    } else if (sc !== SECTION_CODES[si]) {
      err(`${sp}.code`, 'SECTION_ORDER',
        `Section ${si + 1} must be ${SECTION_CODES[si]}, got ${sc}. The order is ${SECTION_CODES.join(', ')}.`)
    }

    const minutes = s['durationMinutes']
    totalMinutes += typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : PATTERN[sc].minutes

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
      const n = checkQuestion(rawQ, qp, sc, ctx)
      if (n !== null) allNumbers.push({ n, path: `${qp}.number` })
    })

    // ---- directions
    const directions = s['directions']
    if (directions !== undefined) {
      if (!Array.isArray(directions)) {
        err(`${sp}.directions`, 'DIRECTIONS_TYPE', '"directions" must be an array when present.')
      } else {
        const ranges: { from: number; to: number; path: string }[] = []
        directions.forEach((rawD, di) => {
          const dp = `${sp}.directions[${di}]`
          const range = checkDirections(rawD, dp, sc, questions, ctx)
          if (range) ranges.push({ ...range, path: dp })
        })
        // A question shows one directions block. With two covering it the
        // second is never seen, so an overlap is always a mistake.
        ranges.sort((a, b) => a.from - b.from)
        for (let i = 1; i < ranges.length; i++) {
          const prev = ranges[i - 1]!
          const cur = ranges[i]!
          if (cur.from <= prev.to) {
            err(cur.path, 'DIRECTIONS_OVERLAP',
              `Range Q${cur.from}-Q${cur.to} overlaps Q${prev.from}-Q${prev.to} (${prev.path}). A question can sit under one directions block only.`)
          }
        }
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
  // Entry closes 45 minutes before the midnight hard stop, so longer sections
  // would be cut short for anyone who starts late (FR-4.1).
  if (totalMinutes > MAX_TOTAL_MINUTES) {
    err('sections', 'DURATION_TOTAL',
      `The sections add up to ${totalMinutes} minutes; the nightly window gives every attempt ${MAX_TOTAL_MINUTES}.`)
  }

  // ---- images
  checkImagesPresent(ctx.images, opts.availableImages, err)

  const publishable = !issues.some((i) => i.severity === 'error')
  return { paper: publishable ? (doc as unknown as Paper) : null, issues }
}

/**
 * Validates one question on its own, with exactly the rules an upload applies
 * to it. Used when the admin edits a question after publication, so an edit
 * cannot put into the database what an upload would have refused.
 */
export function readQuestion(
  raw: unknown,
  sectionCode: SectionCode,
  opts: { availableImages?: string[] } = {},
): Issue[] {
  const { issues, ctx } = collector()
  checkQuestion(raw, 'question', sectionCode, ctx)
  checkImagesPresent(ctx.images, opts.availableImages, ctx.err)
  return issues
}

/** Checks one question; returns its number when it has a usable one. */
function checkQuestion(rawQ: unknown, qp: string, sc: SectionCode, ctx: Ctx): number | null {
  const { err, warn } = ctx
  if (typeof rawQ !== 'object' || rawQ === null || Array.isArray(rawQ)) {
    err(qp, 'QUESTION_TYPE', 'Each question must be an object.')
    return null
  }
  const q = rawQ as Record<string, unknown>
  checkKeys(q, FIELDS.question, qp, err)

  let result: number | null = null
  const number = q['number']
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    err(`${qp}.number`, 'NUMBER_MISSING', `"number" must be a whole number, got ${JSON.stringify(number)}.`)
  } else {
    result = number
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
      `Question text is only ${text.trim().length} characters (ignoring spaces at either end); at least ${MIN_QUESTION_CHARS} are required.`)
  }

  // options
  // `present` is hoisted so the answer can still be checked when the
  // options are missing entirely. Reporting one error at a time would make
  // the admin fix, re-run, and only then discover the next problem.
  let present: string[] = []
  const placeholders: string[] = []
  if (isPlaceholder(text)) placeholders.push('text')
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
      if (isPlaceholder(v)) placeholders.push(`options.${k}`)
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

  // An empty solution or tag is only a warning, but an empty difficulty is an
  // error: schema.json allows only the three words, and so does the database.
  for (const [key, code2] of [['solution', 'SOLUTION_MISSING'], ['tag', 'TAG_MISSING'], ['difficulty', 'DIFFICULTY_MISSING']] as const) {
    const v = q[key]
    if (v === undefined || (v === '' && key !== 'difficulty')) warn(`${qp}.${key}`, code2, `No "${key}".`)
    else if (typeof v !== 'string') err(`${qp}.${key}`, 'FIELD_TYPE', `"${key}" must be a string.`)
    if (key !== 'difficulty' && isPlaceholder(v)) placeholders.push(key)
  }
  const diff = q['difficulty']
  if (typeof diff === 'string' && !['Easy', 'Medium', 'Hard'].includes(diff)) {
    err(`${qp}.difficulty`, 'DIFFICULTY_INVALID',
      `"difficulty" must be Easy, Medium or Hard, got ${JSON.stringify(diff)}. Leave it out rather than empty.`)
  }

  if (placeholders.length) placeholderError(qp, placeholders, err)

  collectImages(q['images'], `${qp}.images`, ctx.images, err)
  return result
}

/** Checks one directions block; returns its range when the range is usable. */
function checkDirections(
  rawD: unknown,
  dp: string,
  sc: SectionCode,
  questions: unknown[],
  ctx: Ctx,
): { from: number; to: number } | null {
  const { err } = ctx
  if (typeof rawD !== 'object' || rawD === null || Array.isArray(rawD)) {
    err(dp, 'DIRECTIONS_TYPE', 'Each directions block must be an object.')
    return null
  }
  const d = rawD as Record<string, unknown>
  checkKeys(d, FIELDS.directions, dp, err)

  const text = d['text']
  if (typeof text !== 'string' || text.trim() === '') {
    err(`${dp}.text`, 'DIRECTIONS_TEXT_MISSING', 'A directions block needs "text".')
  } else if (isPlaceholder(text)) {
    placeholderError(dp, ['text'], err)
  }

  const table = d['table']
  if (table !== undefined) {
    if (typeof table !== 'object' || table === null || Array.isArray(table)) {
      err(`${dp}.table`, 'TABLE_TYPE', '"table" must be an object with "headers" and "rows".')
    } else {
      const t = table as Record<string, unknown>
      checkKeys(t, FIELDS.table, `${dp}.table`, err)
      const headers = t['headers']
      const rows = t['rows']
      if (!Array.isArray(headers) || !headers.every((h) => typeof h === 'string')) {
        err(`${dp}.table.headers`, 'TABLE_HEADERS', '"headers" must be an array of strings.')
      } else if (headers.length === 0) {
        err(`${dp}.table.headers`, 'TABLE_HEADERS', '"headers" must name at least one column.')
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
  collectImages(d['images'], `${dp}.images`, ctx.images, err)

  const from = d['from']
  const to = d['to']
  if (typeof from !== 'number' || typeof to !== 'number' || !Number.isInteger(from) || !Number.isInteger(to)) {
    err(dp, 'DIRECTIONS_RANGE_TYPE', '"from" and "to" must be whole question numbers.')
    return null
  }
  if (from > to) {
    err(dp, 'DIRECTIONS_RANGE_INVERTED', `Range Q${from}-Q${to} runs backwards.`)
    return null
  }
  const covered = questions.filter((qq) => {
    const n = (qq as Record<string, unknown> | null)?.['number']
    return typeof n === 'number' && n >= from && n <= to
  }).length
  const want = to - from + 1
  if (covered !== want) {
    err(dp, 'DIRECTIONS_RANGE_UNMATCHED',
      `Range Q${from}-Q${to} covers ${want} question(s) but ${covered} were found in section ${sc}.`)
  }
  return { from, to }
}

/** Unknown keys are errors, with a suggestion when one is a near miss. */
function checkKeys(o: Record<string, unknown>, allowed: readonly string[], path: string | null, err: ErrFn) {
  for (const key of Object.keys(o)) {
    if (allowed.includes(key)) continue
    const near = allowed.find((a) => nearMiss(a, key))
    err(path ? `${path}.${key}` : key, 'UNKNOWN_FIELD',
      `"${key}" is not a field here${near ? `. Did you mean "${near}"?` : '.'} Allowed: ${allowed.join(', ')}.`)
  }
}

/** Same word apart from case, or at most two edits away. */
function nearMiss(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 2) return false
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]! <= 2
}

function placeholderError(path: string, fields: string[], err: ErrFn) {
  err(path, 'PLACEHOLDER_TEXT',
    `Still holds the placeholder text from template.json (${fields.join(', ')}). Replace it before publishing.`)
}

/** Round-trips through Date.UTC, which rolls 2026-02-31 over to March. */
function isCalendarDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d))
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d
}

function collectImages(v: unknown, path: string, into: Set<string>, err: ErrFn) {
  if (v === undefined) return
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    err(path, 'IMAGES_TYPE', '"images" must be an array of file names.')
    return
  }
  for (const name of v) {
    if (!IMAGE_NAME_PATTERN.test(name)) {
      err(path, 'IMAGE_NAME',
        `Image "${name}" needs a plain file name (letters, digits, dot, dash, underscore) ending in .png, .jpg, .webp or .gif.`)
      continue
    }
    into.add(name)
  }
}

function checkImagesPresent(referenced: Set<string>, available: string[] | undefined, err: ErrFn) {
  const have = new Set(available ?? [])
  for (const ref of referenced) {
    if (!have.has(ref)) {
      err(null, 'IMAGE_MISSING', `Image "${ref}" is referenced but was not uploaded with the paper.`)
    }
  }
}

export function summarise(issues: Issue[]) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return { errors, warnings, publishable: errors.length === 0 }
}
