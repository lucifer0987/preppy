import { describe, expect, it } from 'vitest'
import { buildPaper } from '../scripts/test-papers'
import { readPaper } from '../lib/paper'
import { DEFAULT_PATTERN, patternTotals } from '../lib/types'

/**
 * The generator behind `npm run papers:test`, which fills a development
 * database with a run of papers.
 *
 * It is a dev tool, so it gets one thing tested and tested properly: every
 * paper it writes must pass the same validator an upload runs. A generator
 * that can emit a paper the product refuses -- or worse, one it accepts with a
 * question asked twice -- would be found by whoever is trying to test
 * something else entirely.
 */
describe('the test-paper generator', () => {
  const days = [0, 1, 2, 3, 4, 5, 6]
  const papers = days.map((d) => buildPaper(d, `2027-0${(d % 9) + 1}-15`, d + 2))

  it('writes papers the real validator publishes, with no warnings either', () => {
    for (const [i, p] of papers.entries()) {
      const r = readPaper(JSON.stringify(p))
      const said = r.issues.map((x) => `${x.severity} ${x.code} ${x.path}: ${x.message}`).join('\n')
      expect(r.issues.filter((x) => x.severity === 'error'), `day ${i}:\n${said}`).toEqual([])
      // Warnings are allowed by the product but not wanted here: a generated
      // paper with four options and a spread key should be clean.
      expect(r.issues, `day ${i}:\n${said}`).toEqual([])
      expect(r.paper).not.toBeNull()
    }
  })

  it('matches the shipped pattern exactly', () => {
    const want = patternTotals(DEFAULT_PATTERN)
    for (const p of papers) {
      const r = readPaper(JSON.stringify(p))
      const qs = r.paper!.sections.flatMap((s) => s.questions)
      expect(qs).toHaveLength(want.questions)
      expect(r.paper!.sections.map((s) => s.code)).toEqual(DEFAULT_PATTERN.map((s) => s.code))
    }
  })

  it('never asks the same question twice in one paper', () => {
    for (const [i, p] of papers.entries()) {
      const texts = readPaper(JSON.stringify(p)).paper!.sections
        .flatMap((s) => s.questions).map((q) => q.text)
      expect(new Set(texts).size, `day ${i} repeats a question`).toBe(texts.length)
    }
  })

  it('carries four options on every question, and spreads the key', () => {
    const keys: string[] = []
    for (const p of papers) {
      for (const q of readPaper(JSON.stringify(p)).paper!.sections.flatMap((s) => s.questions)) {
        expect(Object.keys(q.options).sort()).toEqual(['A', 'B', 'C', 'D'])
        keys.push(q.answer)
      }
    }
    // Not a fixed distribution -- just no letter carrying the paper. A quarter
    // of 385 is about 96; anything past half would be guessable.
    for (const label of ['A', 'B', 'C', 'D']) {
      const share = keys.filter((k) => k === label).length / keys.length
      expect(share, `${label} is ${Math.round(share * 100)}% of the key`).toBeGreaterThan(0.15)
      expect(share).toBeLessThan(0.35)
    }
  })

  it('gives the same paper for the same day, and different papers for different days', () => {
    expect(buildPaper(3, '2027-05-05', 9)).toEqual(buildPaper(3, '2027-05-05', 9))
    const a = JSON.stringify(buildPaper(1, '2027-05-05', 9))
    const b = JSON.stringify(buildPaper(2, '2027-05-05', 9))
    expect(a).not.toEqual(b)
  })
})
