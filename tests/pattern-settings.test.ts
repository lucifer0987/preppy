import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PATTERN, type Pattern } from '../lib/types'

vi.mock('server-only', () => ({}))
vi.mock('../lib/supabase/admin', () => ({ db: () => { throw new Error('not used') } }))

const { patternProblem } = await import('../lib/repo/tracks')

/** The default with one section changed, for the one-thing-wrong cases. */
const withPk = (over: Partial<Pattern[number]>): Pattern =>
  DEFAULT_PATTERN.map((s) => s.code === 'PK' ? { ...s, ...over } : s)

describe('what the server will accept as a pattern', () => {
  it('accepts the shipped default', () => {
    expect(patternProblem(DEFAULT_PATTERN)).toBeNull()
  })

  // A track decides how many sections it has, so a three-section pattern is
  // a shorter exam rather than a mistake. What is still refused is none at
  // all, and the same section twice.
  it('accepts a pattern with fewer sections, and refuses an empty one', () => {
    expect(patternProblem(DEFAULT_PATTERN.slice(0, 3))).toBeNull()
    expect(patternProblem([])).toMatch(/at least one section/i)
  })

  it('refuses the same section twice, which would be sat twice', () => {
    const twice = [...DEFAULT_PATTERN, DEFAULT_PATTERN[0]!]
    expect(patternProblem(twice)).toMatch(/appears twice/i)
  })

  it('takes the two sections tracks were given for it', () => {
    const withAwareness: Pattern = [
      ...DEFAULT_PATTERN.slice(0, 3),
      { code: 'COMPUTER_AWARENESS', questions: 10, minutes: 8, marksCorrect: 1, marksNegative: 0.25 },
      { code: 'GENERAL_AWARENESS', questions: 10, minutes: 8, marksCorrect: 1, marksNegative: 0.25 },
    ]
    expect(patternProblem(withAwareness)).toBeNull()
  })

  it('names a section the way its track does, when it complains about it', () => {
    const labelled: Pattern = DEFAULT_PATTERN.map((s) =>
      s.code === 'PK' ? { ...s, label: 'Professional Knowledge (Agriculture)', questions: 0 } : s)
    expect(patternProblem(labelled)).toMatch(/Agriculture/)
  })

  it('refuses question counts that are not whole, positive and sane', () => {
    for (const q of [0, -1, 1.5, 201, Number.NaN]) {
      expect(patternProblem(withPk({ questions: q }))).toMatch(/Professional Knowledge.*questions/)
    }
    expect(patternProblem(withPk({ questions: 200 }))).toBeNull()
  })

  it('refuses minutes that are not whole, positive and sane', () => {
    for (const m of [0, -5, 12.5, 181, Number.NaN]) {
      expect(patternProblem(withPk({ minutes: m }))).toMatch(/Professional Knowledge.*minutes/)
    }
  })

  it('refuses marking that cannot be earned or is absurd', () => {
    expect(patternProblem(withPk({ marksCorrect: 0 }))).toMatch(/correct answer/)
    expect(patternProblem(withPk({ marksCorrect: -1 }))).toMatch(/correct answer/)
    expect(patternProblem(withPk({ marksCorrect: 11 }))).toMatch(/correct answer/)
    expect(patternProblem(withPk({ marksNegative: -0.5 }))).toMatch(/penalty/)
    expect(patternProblem(withPk({ marksNegative: 11 }))).toMatch(/penalty/)
    // No penalty at all is a legitimate choice.
    expect(patternProblem(withPk({ marksNegative: 0 }))).toBeNull()
  })

  it('refuses a paper longer than any day could hold', () => {
    const long = DEFAULT_PATTERN.map((s) => ({ ...s, minutes: 130 }))
    expect(patternProblem(long)).toMatch(/520 minutes/)
    const justFits = DEFAULT_PATTERN.map((s) => ({ ...s, minutes: 120 }))
    expect(patternProblem(justFits)).toBeNull()
  })

  it('refuses marks the column cannot hold exactly', () => {
    expect(patternProblem(withPk({ marksCorrect: 0.125 }))).toMatch(/two decimal places/)
    expect(patternProblem(withPk({ marksNegative: 0.333 }))).toMatch(/two decimal places/)
    // And is not fooled by binary floating point.
    for (const v of [0.07, 0.29, 1.15]) {
      expect(patternProblem(withPk({ marksCorrect: v })), String(v)).toBeNull()
    }
  })

  it('names the section at fault, so the admin knows which box to fix', () => {
    const mixed = DEFAULT_PATTERN.map((s) => s.code === 'ENGLISH' ? { ...s, minutes: 0 } : s)
    expect(patternProblem(mixed)).toMatch(/^English Language:/)
  })
})
