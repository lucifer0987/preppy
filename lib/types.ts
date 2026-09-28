/** The fixed JSON paper format (see docs/architecture.html, section 7). */

export type SectionCode =
  | 'QUANT' | 'REASONING' | 'ENGLISH' | 'PK'
  | 'COMPUTER_AWARENESS' | 'GENERAL_AWARENESS'

/**
 * Every section code that exists, for checking that a file names a real one.
 *
 * This is deliberately *not* the order sections are sat in, and it used to be:
 * it was the four codes of one exam, in sequence, and the whole application
 * read the shape of a paper off it. A track's own pattern decides which
 * sections it has and in what order, so anything that wants the order asks the
 * pattern (`patternBands`, `pattern.map(s => s.code)`) rather than this.
 */
export const ALL_SECTION_CODES: SectionCode[] = [
  'QUANT', 'REASONING', 'ENGLISH', 'PK', 'COMPUTER_AWARENESS', 'GENERAL_AWARENESS',
]

/**
 * What a section is called when its track does not say.
 *
 * PK is the one that usually needs saying: it is Professional Knowledge, and
 * which knowledge is the whole difference between one discipline and the next.
 * A track labels it, and this is the fallback for a track that has not.
 */
export const SECTION_NAMES: Record<SectionCode, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Reasoning Ability',
  ENGLISH: 'English Language',
  PK: 'Professional Knowledge',
  COMPUTER_AWARENESS: 'Computer Awareness',
  GENERAL_AWARENESS: 'General Awareness',
}

/** How one section is shaped. Every number here is configurable per paper. */
export interface SectionPattern {
  code: SectionCode
  questions: number
  minutes: number
  marksCorrect: number
  marksNegative: number
  /** What this track calls it. Absent means the built-in name. */
  label?: string
}

/**
 * A paper's shape: one entry per section, in the order they are sat.
 *
 * Question numbers are deliberately *not* in here. They follow from the counts
 * -- section two starts where section one ended -- and storing them as well
 * would let the two disagree. `patternBands` derives them.
 */
export type Pattern = SectionPattern[]

/**
 * What the product shipped with, and what a paper is given when neither its
 * file nor the admin console says otherwise: 55 questions in 45 minutes,
 * +1 and -0.25 (PRD section 3.1).
 */
export const DEFAULT_PATTERN: Pattern = [
  { code: 'QUANT', questions: 15, minutes: 12, marksCorrect: 1, marksNegative: 0.25 },
  { code: 'REASONING', questions: 15, minutes: 12, marksCorrect: 1, marksNegative: 0.25 },
  { code: 'ENGLISH', questions: 10, minutes: 9, marksCorrect: 1, marksNegative: 0.25 },
  { code: 'PK', questions: 15, minutes: 12, marksCorrect: 1, marksNegative: 0.25 },
]

export interface PatternTotals {
  questions: number
  minutes: number
  /** Every question right. */
  maxMarks: number
  /** Every question wrong, as a negative number. */
  minMarks: number
}

export function patternTotals(pattern: Pattern): PatternTotals {
  let questions = 0, minutes = 0, maxMarks = 0, minMarks = 0
  for (const s of pattern) {
    questions += s.questions
    minutes += s.minutes
    maxMarks += s.questions * s.marksCorrect
    minMarks -= s.questions * s.marksNegative
  }
  return { questions, minutes, maxMarks: round2(maxMarks), minMarks: round2(minMarks) }
}

/** The inclusive question-number range each section holds, from the counts. */
export function patternBands(pattern: Pattern): { code: SectionCode; from: number; to: number }[] {
  let next = 1
  return pattern.map((s) => {
    const from = next
    next += s.questions
    return { code: s.code, from, to: next - 1 }
  })
}

/** By code, for the many places that have a section in hand and want its shape. */
export function patternOf(pattern: Pattern, code: SectionCode): SectionPattern | undefined {
  return pattern.find((s) => s.code === code)
}

/**
 * What to call a section on screen: the track's own label, or the built-in
 * name when it has not set one.
 *
 * Every screen that prints a section name goes through here. Reading
 * SECTION_NAMES directly is how "Professional Knowledge (CSE)" ends up on an
 * Agriculture paper.
 */
export function sectionName(pattern: Pattern, code: SectionCode): string {
  return patternOf(pattern, code)?.label?.trim() || SECTION_NAMES[code]
}

/** Marking is uniform across a paper more often than not; say so when it is. */
export function uniformMarking(pattern: Pattern): { correct: number; negative: number } | null {
  const first = pattern[0]
  if (!first) return null
  const same = pattern.every((s) => s.marksCorrect === first.marksCorrect && s.marksNegative === first.marksNegative)
  return same ? { correct: first.marksCorrect, negative: first.marksNegative } : null
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const FORMAT_NAME = 'preppy-paper'
export const FORMAT_VERSION = 1

/**
 * The date a blank template ships with.
 *
 * Deliberately absurd. Every other placeholder in the template announces
 * itself in words -- "Daily Mock NNN", "Replace with option A" -- but a date
 * has to parse as a date, so it cannot say "fill me in". A real day would be
 * worse than useless: an admin who edits the questions and forgets the date
 * publishes a paper filed under a day that means nothing, and nothing on
 * screen looks wrong. A date no one could ever mean lets the upload refuse it
 * by name, the same way it refuses the unedited title.
 */
export const TEMPLATE_DATE = '9999-12-31'

/**
 * The option labels a question may use: four at least, five at most.
 *
 * A real IBPS paper prints five -- "Out of the five answers to a question only
 * one will be the correct answer" is the wording in their own Information
 * Handout -- so five is the exam's number and a paper written to match it
 * should not have to be cut down to fit. Four stays legal because plenty of
 * questions do not have a fifth distractor worth writing, and a filler option
 * teaches nothing.
 *
 * So the rule is a floor, not a fixed count: at least A to D, and E when the
 * question has one. Per question, not per paper -- a paper may mix them.
 *
 * Why five and not more. The option motif is five shapes (PRD 8.2), and shape
 * is what distinguishes an option independently of colour; the engine's number
 * keys run along the same set. A sixth option would need a sixth shape and a
 * sixth colour that reads in both themes before it could be offered, and no
 * exam in scope asks for one.
 *
 * What it costs, stated so nobody rediscovers it: a blind guess is worth 25%
 * on a four-option question and 20% on a five, against -0.25 marking either
 * way. Guessing breaks even on four and loses on five, which is the real
 * paper's arithmetic.
 *
 * Everything derives from this array and MIN_OPTIONS -- the validator, the
 * schema mirror, the blank template, the key editor, the option palette in the
 * engine -- so the range is stated once.
 */
export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const
export type OptionLabel = (typeof OPTION_LABELS)[number]

/**
 * The fewest options a question may carry. Below four a question stops being
 * a multiple-choice question in the sense the marking assumes.
 */
export const MIN_OPTIONS = 4
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export interface PaperTable {
  headers: string[]
  rows: string[][]
}

export interface PaperDirections {
  /** Inclusive question-number range this block applies to. */
  from: number
  to: number
  text: string
  table?: PaperTable
  images?: string[]
}

export interface PaperQuestion {
  number: number
  text: string
  options: Partial<Record<OptionLabel, string>>
  answer: OptionLabel
  solution?: string
  tag?: string
  difficulty?: Difficulty
  images?: string[]
}

export interface PaperSection {
  code: SectionCode
  /**
   * How many questions this section holds, when that differs from the pattern.
   * Stating it keeps the safety net: a file missing a question is still caught,
   * because the count and the array have to agree.
   */
  questionCount?: number
  durationMinutes?: number
  marksCorrect?: number
  marksNegative?: number
  directions?: PaperDirections[]
  questions: PaperQuestion[]
}

export interface Paper {
  format: typeof FORMAT_NAME
  version: number
  date: string
  title?: string
  sections: PaperSection[]
}

export type IssueSeverity = 'error' | 'warning'

export interface Issue {
  severity: IssueSeverity
  /** Dotted path into the document, e.g. "sections[0].questions[3].answer". */
  path: string | null
  code: string
  message: string
  excerpt?: string
}
