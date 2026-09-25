/** Canonical shapes produced by the PDF grammar parser (PRD §7). */

export type SectionCode = 'QUANT' | 'REASONING' | 'ENGLISH' | 'PK'
export const SECTION_CODES: SectionCode[] = ['QUANT', 'REASONING', 'ENGLISH', 'PK']

export const SECTION_NAMES: Record<SectionCode, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Reasoning Ability',
  ENGLISH: 'English Language',
  PK: 'Professional Knowledge (CSE)',
}

/** PRD §3.1 default pattern: 55 questions, 45 minutes. */
export const DEFAULT_PATTERN: Record<SectionCode, { questions: number; minutes: number }> = {
  QUANT: { questions: 15, minutes: 12 },
  REASONING: { questions: 15, minutes: 12 },
  ENGLISH: { questions: 10, minutes: 9 },
  PK: { questions: 15, minutes: 12 },
}

export const DEFAULT_MARKS = 1
export const DEFAULT_NEGATIVE = 0.25

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type OptionLabel = 'A' | 'B' | 'C' | 'D' | 'E'
export const OPTION_LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E']

export interface ParsedOption {
  label: OptionLabel
  text: string
  imagePaths: string[]
  line: number
}

export interface ParsedQuestion {
  number: number
  text: string
  imagePaths: string[]
  options: ParsedOption[]
  /** null when the file omitted or mangled ANS: — validation turns this into a blocking error. */
  correctOption: OptionLabel | null
  solution: string | null
  tag: string | null
  difficulty: Difficulty | null
  /** Index into ParsedTest.directionBlocks, or null. */
  directionBlockIndex: number | null
  line: number
}

export interface ParsedDirectionBlock {
  qFrom: number
  qTo: number
  content: string
  imagePaths: string[]
  line: number
}

export interface ParsedSection {
  code: SectionCode
  order: number
  durationMinutes: number
  marksCorrect: number
  marksNegative: number
  questions: ParsedQuestion[]
  line: number
}

export interface ParsedTest {
  date: string | null
  title: string | null
  sections: ParsedSection[]
  directionBlocks: ParsedDirectionBlock[]
  /** Every image filename referenced anywhere in the document. */
  referencedImages: string[]
}

export type IssueSeverity = 'error' | 'warning'

export interface Issue {
  severity: IssueSeverity
  /** 1-indexed source line, or null for whole-document issues. */
  line: number | null
  code: string
  message: string
  /** The offending source text, trimmed, when a line is known. */
  excerpt?: string
}

export interface ParseResult {
  test: ParsedTest
  issues: Issue[]
}
