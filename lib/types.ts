/** The fixed JSON paper format (see docs/architecture.html, section 7). */

export type SectionCode = 'QUANT' | 'REASONING' | 'ENGLISH' | 'PK'
export const SECTION_CODES: SectionCode[] = ['QUANT', 'REASONING', 'ENGLISH', 'PK']

export const SECTION_NAMES: Record<SectionCode, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Reasoning Ability',
  ENGLISH: 'English Language',
  PK: 'Professional Knowledge (CSE)',
}

/** How one section is shaped. Every number here is configurable per paper. */
export interface SectionPattern {
  code: SectionCode
  questions: number
  minutes: number
  marksCorrect: number
  marksNegative: number
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

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const
export type OptionLabel = (typeof OPTION_LABELS)[number]
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
