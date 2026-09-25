import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readPaper } from '../lib/paper'
import { pacingVerdict, scoreAttempt, scoreBounds, type ResponseInput } from '../lib/scoring'
import type { OptionLabel, Paper } from '../lib/types'

const paper = (() => {
  const r = readPaper(readFileSync('format/sample.json', 'utf8'))
  if (!r.paper) throw new Error('sample.json is not valid')
  return r.paper
})()

const allQuestions = paper.sections.flatMap((s) => s.questions)
const answerFor = (n: number) => allQuestions.find((q) => q.number === n)!.answer
const wrongFor = (n: number): OptionLabel => {
  const q = allQuestions.find((x) => x.number === n)!
  return (Object.keys(q.options) as OptionLabel[]).find((l) => l !== q.answer)!
}

const visited = (n: number, option: OptionLabel | null): ResponseInput =>
  ({ questionNumber: n, selectedOption: option, wasVisited: true })

describe('marking', () => {
  it('gives +1 for every correct answer', () => {
    const s = scoreAttempt(paper, allQuestions.map((q) => visited(q.number, answerFor(q.number))))
    expect(s.totalScore).toBe(55)
    expect(s.correct).toBe(55)
    expect(s.accuracyPct).toBe(100)
  })

  it('takes 0.25 for every wrong answer', () => {
    const s = scoreAttempt(paper, allQuestions.map((q) => visited(q.number, wrongFor(q.number))))
    expect(s.totalScore).toBe(-13.75)
    expect(s.wrong).toBe(55)
    expect(s.accuracyPct).toBe(0)
  })

  it('matches the bounds the paper declares', () => {
    const { max, min } = scoreBounds(paper)
    expect(max).toBe(55)
    expect(min).toBe(-13.75)
  })

  it('mixes correct and wrong without floating-point drift', () => {
    // 10 right, 3 wrong => 10 - 0.75
    const responses = [
      ...allQuestions.slice(0, 10).map((q) => visited(q.number, answerFor(q.number))),
      ...allQuestions.slice(10, 13).map((q) => visited(q.number, wrongFor(q.number))),
    ]
    const s = scoreAttempt(paper, responses)
    expect(s.totalScore).toBe(9.25)
    expect(s.attempted).toBe(13)
  })

  it('scores an empty attempt as zero, not negative', () => {
    const s = scoreAttempt(paper, [])
    expect(s.totalScore).toBe(0)
    expect(s.attempted).toBe(0)
    expect(s.accuracyPct).toBeNull()
  })
})

describe('not reached vs skipped (FR-3.4)', () => {
  it('counts a question with no response at all as not reached', () => {
    const s = scoreAttempt(paper, [])
    expect(s.notReached).toBe(55)
    expect(s.skipped).toBe(0)
  })

  it('counts an opened but unanswered question as skipped', () => {
    const s = scoreAttempt(paper, allQuestions.map((q) => visited(q.number, null)))
    expect(s.skipped).toBe(55)
    expect(s.notReached).toBe(0)
  })

  it('separates the two within one attempt', () => {
    // Opened Q1-Q5, answered two of them; never opened the rest.
    const s = scoreAttempt(paper, [
      visited(1, answerFor(1)), visited(2, answerFor(2)),
      visited(3, null), visited(4, null), visited(5, null),
    ])
    expect(s.correct).toBe(2)
    expect(s.skipped).toBe(3)
    expect(s.notReached).toBe(50)
    expect(s.attempted).toBe(2)
  })

  it('treats a row flagged not-visited as not reached, whatever it holds', () => {
    const s = scoreAttempt(paper, [{ questionNumber: 1, selectedOption: 'A', wasVisited: false }])
    expect(s.notReached).toBe(55)
    expect(s.attempted).toBe(0)
  })

  it('neither category ever earns or costs marks', () => {
    const s = scoreAttempt(paper, allQuestions.map((q) => visited(q.number, null)))
    expect(s.totalScore).toBe(0)
  })
})

describe('accuracy is over attempted, not over total', () => {
  it('is 100% for two right out of two attempted, with 53 untouched', () => {
    const s = scoreAttempt(paper, [visited(1, answerFor(1)), visited(2, answerFor(2))])
    expect(s.accuracyPct).toBe(100)
    expect(s.attempted).toBe(2)
  })

  it('is null when nothing was attempted, so the page can show a dash', () => {
    expect(scoreAttempt(paper, [visited(1, null)]).accuracyPct).toBeNull()
  })

  it('rounds to two decimals', () => {
    // 2 of 3 correct = 66.666...
    const s = scoreAttempt(paper, [
      visited(1, answerFor(1)), visited(2, answerFor(2)), visited(3, wrongFor(3)),
    ])
    expect(s.accuracyPct).toBe(66.67)
  })
})

describe('sectional breakdown', () => {
  it('reports one row per section, in paper order', () => {
    const s = scoreAttempt(paper, [])
    expect(s.sections.map((x) => x.code)).toEqual(['QUANT', 'REASONING', 'ENGLISH', 'PK'])
  })

  it('keeps sections independent', () => {
    // All of Quant right, nothing else touched.
    const quant = paper.sections[0]!.questions
    const s = scoreAttempt(paper, quant.map((q) => visited(q.number, answerFor(q.number))))
    expect(s.sections[0]!.score).toBe(15)
    expect(s.sections[0]!.accuracyPct).toBe(100)
    expect(s.sections[1]!.score).toBe(0)
    expect(s.sections[1]!.notReached).toBe(15)
    expect(s.totalScore).toBe(15)
  })

  it('honours per-section marks overrides', () => {
    const custom: Paper = {
      ...paper,
      sections: paper.sections.map((s, i) =>
        i === 0 ? { ...s, marksCorrect: 2, marksNegative: 0.5 } : s),
    }
    const q = custom.sections[0]!.questions
    const s = scoreAttempt(custom, [
      visited(q[0]!.number, answerFor(q[0]!.number)),
      visited(q[1]!.number, wrongFor(q[1]!.number)),
    ])
    expect(s.sections[0]!.score).toBe(1.5) // +2 and -0.5
  })
})

describe('the pacing verdict', () => {
  const base = { code: 'QUANT' as const, score: 0, attempted: 0, correct: 0, wrong: 0, accuracyPct: null }

  it('calls out running out of time', () => {
    const v = pacingVerdict({ ...base, skipped: 0, notReached: 4 })
    expect(v).toMatch(/speed problem/)
  })

  it('calls out passing on too much', () => {
    const v = pacingVerdict({ ...base, skipped: 6, notReached: 0 })
    expect(v).toMatch(/confidence problem/)
  })

  it('stays quiet when neither is notable', () => {
    expect(pacingVerdict({ ...base, skipped: 1, notReached: 1, correct: 13 })).toBeNull()
  })

  it('says nothing about a section with no questions at all', () => {
    expect(pacingVerdict({ ...base, skipped: 0, notReached: 0 })).toBeNull()
  })

  it('scales its thresholds to the section, not to the default pattern', () => {
    // A 4-question section: 3 not reached is most of it, and still notable.
    expect(pacingVerdict({ ...base, correct: 1, skipped: 0, notReached: 3 })).toMatch(/speed problem/)
  })

  it('prefers the speed reading when both are high', () => {
    expect(pacingVerdict({ ...base, skipped: 6, notReached: 6 })).toMatch(/speed problem/)
  })
})
