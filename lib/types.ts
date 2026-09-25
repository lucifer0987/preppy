/** The fixed JSON paper format (see docs/architecture.html, section 7). */

export type SectionCode = 'QUANT' | 'REASONING' | 'ENGLISH' | 'PK'
export const SECTION_CODES: SectionCode[] = ['QUANT', 'REASONING', 'ENGLISH', 'PK']

export const SECTION_NAMES: Record<SectionCode, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Reasoning Ability',
  ENGLISH: 'English Language',
  PK: 'Professional Knowledge (CSE)',
}

/** PRD section 3.1: 55 questions, 45 minutes. */
export const PATTERN: Record<SectionCode, { questions: number; minutes: number; from: number; to: number }> = {
  QUANT: { questions: 15, minutes: 12, from: 1, to: 15 },
  REASONING: { questions: 15, minutes: 12, from: 16, to: 30 },
  ENGLISH: { questions: 10, minutes: 9, from: 31, to: 40 },
  PK: { questions: 15, minutes: 12, from: 41, to: 55 },
}

export const TOTAL_QUESTIONS = 55
export const TOTAL_MINUTES = 45
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
