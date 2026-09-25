import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTestDocument } from '../lib/parser.js'
import { summarise, validateTest } from '../lib/validate.js'

const ONE_EACH = { QUANT: 1, REASONING: 1, ENGLISH: 1, PK: 1 }

/** A minimal but structurally complete paper: one question per section. */
function mini(overrides: { q1?: string; extra?: string } = {}) {
  const q = (n: number, ans = 'B') => `
Q${n}. This is a sufficiently long question stem for question ${n}.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: ${ans}
SOL: Because.
TAG: Topic
DIFF: Easy
`
  return `#TEST
DATE: 2026-09-26
TITLE: Mini
#SECTION: QUANT
${overrides.q1 ?? q(1)}
#SECTION: REASONING
${q(2)}
#SECTION: ENGLISH
${q(3)}
#SECTION: PK
${q(4)}
${overrides.extra ?? ''}
#ENDTEST
`
}

function check(src: string, opts = {}) {
  const { test, issues } = parseTestDocument(src)
  const all = [...issues, ...validateTest(test, { expectedCounts: ONE_EACH, ...opts })]
  return { test, ...summarise(all), codes: all.map((i) => i.code) }
}

describe('happy path', () => {
  it('parses the full 55-question sample as publishable', () => {
    const src = readFileSync('docs/sample.txt', 'utf8')
    const { test, issues } = parseTestDocument(src)
    const all = [...issues, ...validateTest(test)]
    const { publishable, errors } = summarise(all)
    expect(errors, errors.map((e) => `${e.code}: ${e.message}`).join('\n')).toHaveLength(0)
    expect(publishable).toBe(true)
    expect(test.sections.flatMap((s) => s.questions)).toHaveLength(55)
    expect(test.directionBlocks).toHaveLength(3)
  })

  it('attaches every question in a directions range to that block', () => {
    const { test } = parseTestDocument(readFileSync('docs/sample.txt', 'utf8'))
    const all = test.sections.flatMap((s) => s.questions)
    const di = all.filter((q) => q.number >= 6 && q.number <= 10)
    expect(di.every((q) => q.directionBlockIndex === 0)).toBe(true)
    expect(all.find((q) => q.number === 11)?.directionBlockIndex).toBeNull()
  })

  it('keeps the DI table rows intact inside the directions block', () => {
    const { test } = parseTestDocument(readFileSync('docs/sample.txt', 'utf8'))
    expect(test.directionBlocks[0]?.content).toContain('2024')
    expect(test.directionBlocks[0]?.content.split('\n').length).toBeGreaterThan(3)
  })

  it('is clean on the minimal paper', () => {
    expect(check(mini()).publishable).toBe(true)
  })
})

describe('option label variants', () => {
  it('accepts A) and A. and (A)', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B. Second option
(C) Third option
D) Fourth option
E) None of these
ANS: C
`
    const r = check(mini({ q1 }))
    expect(r.publishable).toBe(true)
    const q = r.test.sections[0]?.questions[0]
    expect(q?.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(q?.options[2]?.text).toBe('Third option')
  })
})

describe('multi-line text', () => {
  it('joins a question stem wrapped across lines', () => {
    const q1 = `
Q1. This question stem begins here
and continues on a second line
and finishes on a third.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: A
`
    const r = check(mini({ q1 }))
    expect(r.test.sections[0]?.questions[0]?.text)
      .toBe('This question stem begins here and continues on a second line and finishes on a third.')
  })
})

describe('blocking errors', () => {
  it('flags a missing answer key', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('ANS_MISSING')
    expect(r.publishable).toBe(false)
  })

  it('flags an answer key that is not one of the options', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
ANS: D
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('ANS_NOT_AN_OPTION')
    expect(r.publishable).toBe(false)
  })

  it('flags duplicate question numbers', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
ANS: A

Q1. A different question reusing the same number entirely.
A) First option
B) Second option
ANS: B
`
    const r = check(mini({ q1 }), { expectedCounts: { QUANT: 2, REASONING: 1, ENGLISH: 1, PK: 1 } })
    expect(r.codes).toContain('QUESTION_DUPLICATE')
    expect(r.publishable).toBe(false)
  })

  it('flags a gap in numbering, which means extraction lost a question', () => {
    const src = mini().replace('Q3.', 'Q9.')
    const r = check(src)
    expect(r.codes).toContain('QUESTION_GAP')
    expect(r.publishable).toBe(false)
  })

  it('flags a section whose question count does not match the pattern', () => {
    const r = check(mini(), { expectedCounts: { QUANT: 15, REASONING: 1, ENGLISH: 1, PK: 1 } })
    expect(r.codes).toContain('SECTION_COUNT')
    expect(r.publishable).toBe(false)
  })

  it('flags an unrecognised section code', () => {
    const r = check(mini().replace('#SECTION: PK', '#SECTION: COMPUTERS'))
    expect(r.codes).toContain('SECTION_UNKNOWN')
    expect(r.codes).toContain('SECTION_MISSING')
    expect(r.publishable).toBe(false)
  })

  it('flags a missing section', () => {
    const r = check(mini().replace(/#SECTION: ENGLISH[\s\S]*?(?=#SECTION: PK)/, ''),
      { expectedCounts: { QUANT: 1, REASONING: 1, PK: 1 } })
    expect(r.codes).toContain('SECTION_MISSING')
    expect(r.publishable).toBe(false)
  })

  it('flags an unclosed directions block', () => {
    const extra = `
#DIRECTIONS: Q1-Q2
A passage with no closing marker.
`
    const r = check(mini({ extra }))
    expect(r.codes).toContain('DIRECTIONS_UNCLOSED')
    expect(r.publishable).toBe(false)
  })

  it('flags a directions range covering questions that do not exist', () => {
    const extra = `
#DIRECTIONS: Q80-Q85
A passage pointing at questions that were never written.
#ENDDIRECTIONS
`
    const r = check(mini({ extra }))
    expect(r.codes).toContain('DIRECTIONS_RANGE_UNMATCHED')
    expect(r.publishable).toBe(false)
  })

  it('flags a malformed date', () => {
    const r = check(mini().replace('DATE: 2026-09-26', 'DATE: 26/09/2026'))
    expect(r.codes).toContain('DATE_MALFORMED')
    expect(r.publishable).toBe(false)
  })

  it('flags a date already holding a published test', () => {
    const r = check(mini(), { takenDates: ['2026-09-26'] })
    expect(r.codes).toContain('DATE_TAKEN')
    expect(r.publishable).toBe(false)
  })

  it('flags more than five options', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
C) Third option
D) Fourth option
E) Fifth option
ANS: A
`
    // Six labels is impossible with A-E, so exercise the duplicate path instead.
    const dup = q1.replace('E) Fifth option', 'E) Fifth option\nE) Sixth option')
    const r = check(mini({ q1: dup }))
    expect(r.codes).toContain('OPTION_DUPLICATE')
    expect(r.publishable).toBe(false)
  })

  it('flags a referenced image that was not uploaded', () => {
    const q1 = `
Q1. This is a sufficiently long question stem. [IMG: chart.png]
A) First option
B) Second option
ANS: A
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('IMAGE_MISSING')
    expect(r.publishable).toBe(false)
  })

  it('accepts a referenced image that was uploaded', () => {
    const q1 = `
Q1. This is a sufficiently long question stem. [IMG: chart.png]
A) First option
B) Second option
ANS: A
`
    const r = check(mini({ q1 }), { availableImages: ['chart.png'] })
    expect(r.codes).not.toContain('IMAGE_MISSING')
    expect(r.publishable).toBe(true)
  })

  it('flags a question whose text was lost in extraction', () => {
    const q1 = `
Q1.
A) First option
B) Second option
ANS: A
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('QUESTION_TEXT_EMPTY')
    expect(r.publishable).toBe(false)
  })

  it('flags a missing #ENDTEST', () => {
    const r = check(mini().replace('#ENDTEST', ''))
    expect(r.codes).toContain('TEST_MISSING_CLOSE')
    expect(r.publishable).toBe(false)
  })
})

describe('warnings do not block', () => {
  it('allows a paper with no solutions, tags or difficulty', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
C) Third option
D) Fourth option
E) None of these
ANS: A
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('SOL_MISSING')
    expect(r.codes).toContain('TAG_MISSING')
    expect(r.publishable).toBe(true)
  })

  it('warns when a question carries fewer than five options', () => {
    const q1 = `
Q1. This is a sufficiently long question stem for question 1.
A) First option
B) Second option
ANS: A
`
    const r = check(mini({ q1 }))
    expect(r.codes).toContain('OPTION_UNDER_FIVE')
    expect(r.publishable).toBe(true)
  })
})

describe('section directives', () => {
  it('reads DURATION, MARKS and NEGATIVE overrides', () => {
    const src = mini().replace('#SECTION: QUANT', '#SECTION: QUANT\nDURATION: 20\nMARKS: 2\nNEGATIVE: 0.5')
    const { test } = parseTestDocument(src)
    const s = test.sections[0]!
    expect(s.durationMinutes).toBe(20)
    expect(s.marksCorrect).toBe(2)
    expect(s.marksNegative).toBe(0.5)
  })

  it('reads directives written inline on the section header', () => {
    const src = mini().replace('#SECTION: ENGLISH', '#SECTION: ENGLISH   DURATION: 9')
    const { test } = parseTestDocument(src)
    expect(test.sections.find((s) => s.code === 'ENGLISH')?.durationMinutes).toBe(9)
  })

  it('defaults to the PRD pattern when no duration is given', () => {
    const { test } = parseTestDocument(mini())
    expect(test.sections.find((s) => s.code === 'ENGLISH')?.durationMinutes).toBe(9)
    expect(test.sections.find((s) => s.code === 'QUANT')?.durationMinutes).toBe(12)
  })
})
