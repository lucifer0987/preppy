import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { paperToRows, rowsToPaper } from '../lib/paper-rows'
import { readPaper } from '../lib/paper'
import { PATTERN } from '../lib/types'

const load = (f: string) => {
  const r = readPaper(readFileSync(f, 'utf8'))
  if (!r.paper) throw new Error(`${f} is not valid`)
  return r.paper
}
const sample = load('format/sample.json')
const paper002 = load('format/paper-002.json')

describe('paper -> rows', () => {
  it('produces one row per section, block and question', () => {
    const rows = paperToRows(sample)
    expect(rows.sections).toHaveLength(4)
    expect(rows.questions).toHaveLength(55)
    expect(rows.directionBlocks).toHaveLength(3)
  })

  it('stores durations in seconds', () => {
    const rows = paperToRows(sample)
    const english = rows.sections.find((s) => s.code === 'ENGLISH')!
    expect(english.duration_sec).toBe(PATTERN.ENGLISH.minutes * 60)
    expect(rows.sections.reduce((a, s) => a + s.duration_sec, 0)).toBe(45 * 60)
  })

  it('numbers section positions from one, in document order', () => {
    expect(paperToRows(sample).sections.map((s) => s.position)).toEqual([1, 2, 3, 4])
  })

  it('links each question to the directions block covering it', () => {
    const rows = paperToRows(sample)
    const byNumber = new Map(rows.questions.map((q) => [q.number, q]))
    // The DI set covers Q6-Q10 and is the only block in QUANT.
    for (const n of [6, 7, 8, 9, 10]) expect(byNumber.get(n)!.directionIndex).toBe(0)
    for (const n of [1, 5, 11, 15]) expect(byNumber.get(n)!.directionIndex).toBeNull()
  })

  it('carries the DI table through as structured data', () => {
    const rows = paperToRows(sample)
    const block = rows.directionBlocks.find((b) => b.sectionCode === 'QUANT')!
    expect(block.table_data).toMatchObject({ headers: ['Year', 'Java', 'Python', 'DBMS', 'Networking'] })
  })

  it('defaults marks when the paper omits them', () => {
    const bare = { ...sample, sections: sample.sections.map((s) => ({ ...s, marksCorrect: undefined, marksNegative: undefined })) }
    const rows = paperToRows(bare as never)
    expect(rows.sections.every((s) => s.marks_correct === 1 && s.marks_negative === 0.25)).toBe(true)
  })

  it('starts every paper as a draft, never published by accident (FR-6.9.1)', () => {
    expect(paperToRows(sample).test.status).toBe('DRAFT')
  })
})

describe('rows -> paper is the inverse', () => {
  for (const [name, paper] of [['sample', sample], ['paper-002', paper002]] as const) {
    it(`round-trips ${name} unchanged`, () => {
      expect(rowsToPaper(paperToRows(paper))).toEqual(paper)
    })

    it(`${name} survives the round trip still valid`, () => {
      const back = rowsToPaper(paperToRows(paper))
      const r = readPaper(JSON.stringify(back))
      expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    })
  }

  it('keeps questions in ascending order even if rows come back shuffled', () => {
    const rows = paperToRows(sample)
    rows.questions.reverse()
    const back = rowsToPaper(rows)
    const numbers = back.sections.flatMap((s) => s.questions.map((q) => q.number))
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  it('keeps sections in position order even if rows come back shuffled', () => {
    const rows = paperToRows(sample)
    rows.sections.reverse()
    expect(rowsToPaper(rows).sections.map((s) => s.code)).toEqual(['QUANT', 'REASONING', 'ENGLISH', 'PK'])
  })
})
