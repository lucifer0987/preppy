import {
  DEFAULT_MARKS,
  DEFAULT_NEGATIVE,
  DEFAULT_PATTERN,
  OPTION_LABELS,
  SECTION_CODES,
  type Difficulty,
  type Issue,
  type OptionLabel,
  type ParseResult,
  type ParsedDirectionBlock,
  type ParsedOption,
  type ParsedQuestion,
  type ParsedSection,
  type ParsedTest,
  type SectionCode,
} from './types.js'

/**
 * Line-based grammar parser for the Preppy PDF contract (PRD §7).
 *
 * Deliberately strict: it records what it could not understand rather than
 * guessing, because a silently mis-parsed paper is far worse than a rejected
 * one. Structural problems surface here; semantic ones in validate.ts.
 */

const RE_IMG = /\[IMG:\s*([^\]]+?)\s*\]/gi
/** Q1. | Q1) | Q1: | Q1 — all tolerated; the number is what matters. */
const RE_QUESTION = /^Q\s*(\d{1,3})\s*[.):]?\s*(.*)$/i
/** A) | A. | (A) | A - ; a following space or bracket is required so prose is not eaten. */
const RE_OPTION = /^\(?([A-E])\)\s*(.*)$|^\(?([A-E])[.]\s+(.*)$|^\(?([A-E])\s*[-–]\s+(.*)$/i
const RE_DIRECTIVE = /^([A-Z]+)\s*:\s*(.*)$/
const RE_DIRECTIONS_OPEN = /^#DIRECTIONS\s*:\s*Q?\s*(\d{1,3})\s*[-–—to]+\s*Q?\s*(\d{1,3})\s*$/i
const RE_SECTION = /^#SECTION\s*:\s*(.*)$/i

/** Strip and collect [IMG: name] markers from a chunk of text. */
function extractImages(text: string): { text: string; images: string[] } {
  const images: string[] = []
  const stripped = text.replace(RE_IMG, (_m, name: string) => {
    images.push(name.trim())
    return ' '
  })
  return { text: stripped.replace(/[ \t]+/g, ' ').trim(), images }
}

function normaliseLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    // Non-breaking and zero-width characters are routine in PDF text layers.
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n')
}

type Pending = {
  q: ParsedQuestion
  /** Which field trailing prose should append to. */
  sink: 'text' | 'solution' | null
}

export function parseTestDocument(raw: string): ParseResult {
  const lines = normaliseLines(raw)
  const issues: Issue[] = []
  const sections: ParsedSection[] = []
  const directionBlocks: ParsedDirectionBlock[] = []

  const test: ParsedTest = {
    date: null,
    title: null,
    sections,
    directionBlocks,
    referencedImages: [],
  }

  const add = (severity: Issue['severity'], line: number | null, code: string, message: string, excerpt?: string) =>
    issues.push({ severity, line, code, message, ...(excerpt ? { excerpt: excerpt.slice(0, 120) } : {}) })

  let sawTestOpen = false
  let sawTestClose = false
  let section: ParsedSection | null = null
  let pending: Pending | null = null
  /** Open #DIRECTIONS block being accumulated. */
  let dirOpen: { block: ParsedDirectionBlock; lines: string[] } | null = null

  const flushQuestion = () => {
    if (!pending) return
    const { q } = pending
    const owner = section
    if (owner) owner.questions.push(q)
    pending = null
  }

  const closeDirections = () => {
    if (!dirOpen) return
    const { text, images } = extractImages(dirOpen.lines.join('\n'))
    dirOpen.block.content = text
    dirOpen.block.imagePaths = images
    directionBlocks.push(dirOpen.block)
    dirOpen = null
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? ''
    const line = rawLine.trim()
    const lineNo = i + 1

    // ---- inside an open #DIRECTIONS block: everything is content until #ENDDIRECTIONS
    if (dirOpen) {
      if (/^#ENDDIRECTIONS\s*$/i.test(line)) {
        closeDirections()
      } else if (/^#(TEST|ENDTEST|SECTION|DIRECTIONS)\b/i.test(line)) {
        add('error', lineNo, 'DIRECTIONS_UNCLOSED',
          `#DIRECTIONS block opened on line ${dirOpen.block.line} was never closed with #ENDDIRECTIONS.`, line)
        closeDirections()
        i-- // reprocess this structural line outside the block
      } else {
        dirOpen.lines.push(rawLine)
      }
      continue
    }

    if (line === '') {
      // A blank line ends free-text accumulation but does not close the question.
      if (pending) pending.sink = null
      continue
    }

    // ---- structural markers
    if (/^#TEST\s*$/i.test(line)) {
      if (sawTestOpen) add('error', lineNo, 'TEST_DUPLICATE', 'A second #TEST marker was found.', line)
      sawTestOpen = true
      continue
    }
    if (/^#ENDTEST\s*$/i.test(line)) {
      flushQuestion()
      sawTestClose = true
      continue
    }

    const mDirOpen = RE_DIRECTIONS_OPEN.exec(line)
    if (mDirOpen) {
      flushQuestion()
      const qFrom = Number(mDirOpen[1])
      const qTo = Number(mDirOpen[2])
      if (qFrom > qTo) {
        add('error', lineNo, 'DIRECTIONS_RANGE_INVERTED',
          `#DIRECTIONS range Q${qFrom}-Q${qTo} runs backwards.`, line)
      }
      dirOpen = { block: { qFrom, qTo, content: '', imagePaths: [], line: lineNo }, lines: [] }
      continue
    }
    if (/^#ENDDIRECTIONS\s*$/i.test(line)) {
      add('error', lineNo, 'DIRECTIONS_STRAY_CLOSE', '#ENDDIRECTIONS found without a matching #DIRECTIONS.', line)
      continue
    }
    if (/^#DIRECTIONS\b/i.test(line)) {
      add('error', lineNo, 'DIRECTIONS_MALFORMED',
        'Could not read the #DIRECTIONS range. Expected: #DIRECTIONS: Q6-Q10', line)
      continue
    }

    const mSection = RE_SECTION.exec(line)
    if (mSection) {
      flushQuestion()
      const rest = (mSection[1] ?? '').trim()
      // First token is the code; any further KEY: value pairs on the line are section directives.
      const codeToken = (rest.split(/\s+/)[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '')
      const code = SECTION_CODES.find((c) => c === codeToken)
      if (!code) {
        add('error', lineNo, 'SECTION_UNKNOWN',
          `Unrecognised section code "${codeToken || rest}". Expected one of ${SECTION_CODES.join(', ')}.`, line)
        section = null
        continue
      }
      if (sections.some((s) => s.code === code)) {
        add('error', lineNo, 'SECTION_DUPLICATE', `Section ${code} appears more than once.`, line)
      }
      section = {
        code,
        order: sections.length + 1,
        durationMinutes: DEFAULT_PATTERN[code].minutes,
        marksCorrect: DEFAULT_MARKS,
        marksNegative: DEFAULT_NEGATIVE,
        questions: [],
        line: lineNo,
      }
      sections.push(section)
      // Inline directives, e.g. "#SECTION: ENGLISH   DURATION: 9"
      const inline = rest.slice((rest.split(/\s+/)[0] ?? '').length)
      for (const m of inline.matchAll(/([A-Z]+)\s*:\s*([^\s]+)/gi)) {
        applySectionDirective(section, (m[1] ?? '').toUpperCase(), m[2] ?? '', lineNo, add)
      }
      continue
    }

    if (/^#/.test(line)) {
      add('warning', lineNo, 'UNKNOWN_DIRECTIVE', `Unrecognised directive "${line.split(/\s/)[0]}" was ignored.`, line)
      continue
    }

    // ---- question start
    const mQ = RE_QUESTION.exec(line)
    if (mQ && looksLikeQuestionStart(line)) {
      flushQuestion()
      const number = Number(mQ[1])
      const { text, images } = extractImages(mQ[2] ?? '')
      if (!section) {
        add('error', lineNo, 'QUESTION_OUTSIDE_SECTION',
          `Q${number} appears before any #SECTION header.`, line)
      }
      const q: ParsedQuestion = {
        number,
        text,
        imagePaths: images,
        options: [],
        correctOption: null,
        solution: null,
        tag: null,
        difficulty: null,
        directionBlockIndex: null,
        line: lineNo,
      }
      pending = { q, sink: 'text' }
      continue
    }

    // ---- option line
    const mO = RE_OPTION.exec(line)
    if (mO && pending) {
      const label = ((mO[1] ?? mO[3] ?? mO[5]) as string).toUpperCase() as OptionLabel
      const body = (mO[2] ?? mO[4] ?? mO[6] ?? '') as string
      const { text, images } = extractImages(body)
      if (!OPTION_LABELS.includes(label)) {
        add('error', lineNo, 'OPTION_LABEL_INVALID', `Option label "${label}" is not A-E.`, line)
        continue
      }
      pending.q.options.push({ label, text, imagePaths: images, line: lineNo })
      pending.sink = null
      continue
    }

    // ---- per-question directives
    const mD = RE_DIRECTIVE.exec(line)
    if (mD) {
      const key = (mD[1] ?? '').toUpperCase()
      const value = (mD[2] ?? '').trim()

      if (key === 'DATE') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          add('error', lineNo, 'DATE_MALFORMED', `DATE must be YYYY-MM-DD, got "${value}".`, line)
        } else if (Number.isNaN(Date.parse(value))) {
          add('error', lineNo, 'DATE_INVALID', `DATE "${value}" is not a real calendar date.`, line)
        } else {
          test.date = value
        }
        continue
      }
      if (key === 'TITLE') { test.title = value || null; continue }

      if (key === 'DURATION' || key === 'MARKS' || key === 'NEGATIVE') {
        if (!section) {
          add('error', lineNo, 'DIRECTIVE_OUTSIDE_SECTION', `${key} appears before any #SECTION header.`, line)
        } else {
          applySectionDirective(section, key, value, lineNo, add)
        }
        continue
      }

      if (key === 'ANS') {
        if (!pending) { add('error', lineNo, 'ANS_ORPHAN', 'ANS: found with no preceding question.', line); continue }
        const letter = value.toUpperCase().replace(/[^A-E]/g, '')
        if (letter.length !== 1) {
          add('error', lineNo, 'ANS_MALFORMED',
            `Could not read the answer key from "${value}". Expected a single letter A-E.`, line)
        } else {
          pending.q.correctOption = letter as OptionLabel
        }
        pending.sink = null
        continue
      }
      if (key === 'SOL') {
        if (!pending) { add('error', lineNo, 'SOL_ORPHAN', 'SOL: found with no preceding question.', line); continue }
        const { text, images } = extractImages(value)
        pending.q.solution = text
        pending.q.imagePaths.push(...images)
        pending.sink = 'solution'
        continue
      }
      if (key === 'TAG') {
        if (pending) pending.q.tag = value || null
        else add('warning', lineNo, 'TAG_ORPHAN', 'TAG: found with no preceding question; ignored.', line)
        if (pending) pending.sink = null
        continue
      }
      if (key === 'DIFF') {
        if (pending) {
          const d = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
          if (d === 'Easy' || d === 'Medium' || d === 'Hard') pending.q.difficulty = d as Difficulty
          else add('warning', lineNo, 'DIFF_UNKNOWN', `DIFF "${value}" is not Easy/Medium/Hard; ignored.`, line)
          pending.sink = null
        }
        continue
      }
      // Unknown KEY: value — fall through and treat as prose.
    }

    // ---- continuation prose
    if (pending && pending.sink) {
      const { text, images } = extractImages(line)
      if (pending.sink === 'text') {
        pending.q.text = (pending.q.text ? pending.q.text + ' ' : '') + text
        pending.q.imagePaths.push(...images)
      } else {
        pending.q.solution = (pending.q.solution ? pending.q.solution + ' ' : '') + text
        pending.q.imagePaths.push(...images)
      }
      continue
    }

    // ---- prose we cannot place
    if (pending && pending.q.options.length > 0) {
      // Text after the options but before the next question: append to the last option.
      const last = pending.q.options[pending.q.options.length - 1]
      if (last) {
        const { text, images } = extractImages(line)
        last.text = (last.text ? last.text + ' ' : '') + text
        last.imagePaths.push(...images)
        continue
      }
    }
    add('warning', lineNo, 'ORPHAN_TEXT', 'Text could not be attached to any question and was ignored.', line)
  }

  flushQuestion()
  if (dirOpen) {
    add('error', dirOpen.block.line, 'DIRECTIONS_UNCLOSED',
      'A #DIRECTIONS block was never closed with #ENDDIRECTIONS.')
    closeDirections()
  }
  if (!sawTestOpen) add('error', null, 'TEST_MISSING_OPEN', 'The file does not contain a #TEST marker.')
  if (!sawTestClose) add('error', null, 'TEST_MISSING_CLOSE', 'The file does not contain an #ENDTEST marker.')

  linkDirectionBlocks(test, add)

  const imgs = new Set<string>()
  for (const b of directionBlocks) b.imagePaths.forEach((p) => imgs.add(p))
  for (const s of sections)
    for (const q of s.questions) {
      q.imagePaths.forEach((p) => imgs.add(p))
      q.options.forEach((o) => o.imagePaths.forEach((p) => imgs.add(p)))
    }
  test.referencedImages = [...imgs]

  return { test, issues }
}

function applySectionDirective(
  section: ParsedSection,
  key: string,
  value: string,
  lineNo: number,
  add: (s: Issue['severity'], l: number | null, c: string, m: string, e?: string) => void,
) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    add('error', lineNo, `${key}_MALFORMED`, `${key} must be a number, got "${value}".`)
    return
  }
  if (key === 'DURATION') {
    if (n <= 0 || n > 180) add('error', lineNo, 'DURATION_RANGE', `DURATION ${n} is outside 1-180 minutes.`)
    else section.durationMinutes = n
  } else if (key === 'MARKS') {
    if (n <= 0) add('error', lineNo, 'MARKS_RANGE', `MARKS must be positive, got ${n}.`)
    else section.marksCorrect = n
  } else if (key === 'NEGATIVE') {
    if (n < 0) add('error', lineNo, 'NEGATIVE_RANGE', `NEGATIVE must be zero or positive, got ${n}.`)
    else section.marksNegative = n
  }
}

/** Attach each question to the #DIRECTIONS block whose range covers it. */
function linkDirectionBlocks(
  test: ParsedTest,
  add: (s: Issue['severity'], l: number | null, c: string, m: string, e?: string) => void,
) {
  const all = test.sections.flatMap((s) => s.questions)
  test.directionBlocks.forEach((block, idx) => {
    let covered = 0
    for (const q of all) {
      if (q.number >= block.qFrom && q.number <= block.qTo) {
        q.directionBlockIndex = idx
        covered++
      }
    }
    const expected = block.qTo - block.qFrom + 1
    if (covered !== expected) {
      add('error', block.line, 'DIRECTIONS_RANGE_UNMATCHED',
        `#DIRECTIONS: Q${block.qFrom}-Q${block.qTo} covers ${expected} question(s) but ${covered} were found.`)
    }
  })
}

/**
 * Guards against prose like "Q3 is harder than..." opening a new question.
 * A real question start either carries a separator or begins a substantial line.
 */
function looksLikeQuestionStart(line: string): boolean {
  return /^Q\s*\d{1,3}\s*[.):]/i.test(line)
}
