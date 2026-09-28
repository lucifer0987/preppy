import { describe, expect, it } from 'vitest'
import {
  REVIEW_LABEL, answerIsSealed, reviewState, tally, type ReviewState,
} from '../lib/review'

/**
 * Which questions keep their key hidden, and why.
 *
 * The rule is small enough to read off the source and easy enough to get
 * backwards, and getting it backwards has two different costs: seal a question
 * the student answered and the page withholds the thing they came for; unseal
 * one they skipped and a question worth re-attempting is spoiled before they
 * can try it.
 */
describe('how a question went', () => {
  const seen = (selected: string | null) => ({ selected, visited: true })

  it('reads an answer against the key', () => {
    expect(reviewState(seen('B'), 'B', true)).toBe('correct')
    expect(reviewState(seen('C'), 'B', true)).toBe('wrong')
  })

  it('separates a question you left blank from one you never saw', () => {
    expect(reviewState(seen(null), 'B', true)).toBe('skipped')
    expect(reviewState({ selected: null, visited: false }, 'B', true)).toBe('unreached')
    // No row at all: the section was never opened, which reads the same way.
    expect(reviewState(undefined, 'B', true)).toBe('unreached')
  })

  it('calls it unattempted when the student never sat the paper', () => {
    // Even with a row present -- a dry run, say -- sat: false is the whole
    // answer, because there is no attempt of theirs for this page to compare.
    expect(reviewState(undefined, 'B', false)).toBe('unattempted')
    expect(reviewState(seen('B'), 'B', false)).toBe('unattempted')
  })

  /**
   * A row marked visited with an answer in it can only have come from
   * answering, so there is no state where a student both answered and did not
   * reach a question. Stated as a test because the two flags are independent
   * in the table and nothing else stops the combination.
   */
  it('lets an answer settle it, whatever the visited flag says', () => {
    expect(reviewState({ selected: 'B', visited: false }, 'B', true)).toBe('unreached')
    expect(reviewState({ selected: 'B', visited: true }, 'B', true)).toBe('correct')
  })
})

describe('which answers stay sealed', () => {
  it('seals exactly the two unanswered states', () => {
    expect(answerIsSealed('skipped')).toBe(true)
    expect(answerIsSealed('unreached')).toBe(true)
  })

  it('never seals a question the student answered', () => {
    expect(answerIsSealed('correct')).toBe(false)
    expect(answerIsSealed('wrong')).toBe(false)
  })

  /**
   * Somebody reading a paper they did not sit is reading a worked solution.
   * Sealing it would make them press a button on all fifty-five to see any of
   * it, protecting an attempt that does not exist.
   */
  it('does not seal a paper the reader never sat', () => {
    expect(answerIsSealed('unattempted')).toBe(false)
  })

  it('has a word for every state, and no state without one', () => {
    const all: ReviewState[] =
      ['correct', 'wrong', 'skipped', 'unreached', 'unattempted']
    for (const s of all) expect(REVIEW_LABEL[s], s).toBeTruthy()
    expect(Object.keys(REVIEW_LABEL).sort()).toEqual([...all].sort())
  })
})

describe('the strip above the questions', () => {
  it('counts each state and leaves the rest at zero', () => {
    const t = tally(['correct', 'correct', 'wrong', 'skipped'])
    expect(t).toEqual({ correct: 2, wrong: 1, skipped: 1, unreached: 0, unattempted: 0 })
  })

  it('adds up to the paper, however it went', () => {
    const states: ReviewState[] =
      ['correct', 'wrong', 'skipped', 'unreached', 'correct', 'skipped']
    const t = tally(states)
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(states.length)
  })

  it('counts nothing from nothing', () => {
    expect(Object.values(tally([])).every((n) => n === 0)).toBe(true)
  })
})
