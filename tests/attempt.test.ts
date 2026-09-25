import { describe, expect, it } from 'vitest'
import { acceptsResponses, advanceSection, attemptStatus, type SectionProgress } from '../lib/attempt'
import { istInstant } from '../lib/time'

const D = '2026-09-26'
const at = (hh: number, mm: number, ss = 0) =>
  new Date(istInstant(D, hh, mm).getTime() + ss * 1000)
const HARD_STOP = istInstant(D, 23, 59)

/** The real pattern: 12, 12, 9, 12 minutes. */
function freshSections(startedAt: Date | null = null): SectionProgress[] {
  return [
    { code: 'QUANT', position: 1, durationSec: 12 * 60, startedAt, endedAt: null, endReason: null },
    { code: 'REASONING', position: 2, durationSec: 12 * 60, startedAt: null, endedAt: null, endReason: null },
    { code: 'ENGLISH', position: 3, durationSec: 9 * 60, startedAt: null, endedAt: null, endReason: null },
    { code: 'PK', position: 4, durationSec: 12 * 60, startedAt: null, endedAt: null, endReason: null },
  ]
}

describe('which section is open', () => {
  it('opens the first section at the start', () => {
    const s = attemptStatus(freshSections(at(22, 0)), at(22, 0), HARD_STOP)
    expect(s.currentPosition).toBe(1)
    expect(s.remainingSec).toBe(12 * 60)
    expect(s.finished).toBe(false)
  })

  it('counts down within the open section', () => {
    const s = attemptStatus(freshSections(at(22, 0)), at(22, 5), HARD_STOP)
    expect(s.remainingSec).toBe(7 * 60)
    expect(s.sectionExpired).toBe(false)
  })

  it('marks the section expired the instant its allowance runs out', () => {
    const s = attemptStatus(freshSections(at(22, 0)), at(22, 12), HARD_STOP)
    expect(s.remainingSec).toBe(0)
    expect(s.sectionExpired).toBe(true)
    // Not the last section, so the attempt continues.
    expect(s.finished).toBe(false)
  })

  it('reports finished once every section is closed', () => {
    const sections = freshSections(at(22, 0)).map((s) => ({
      ...s, startedAt: at(22, 0), endedAt: at(22, 30), endReason: 'SUBMITTED' as const,
    }))
    const s = attemptStatus(sections, at(22, 40), HARD_STOP)
    expect(s.finished).toBe(true)
    expect(s.currentPosition).toBeNull()
    expect(s.finishReason).toBe('ALL_SECTIONS_DONE')
  })

  it('ends the attempt when the last section runs out', () => {
    const sections = freshSections()
    for (const s of sections.slice(0, 3)) { s.startedAt = at(22, 0); s.endedAt = at(22, 1); s.endReason = 'SUBMITTED' }
    sections[3]!.startedAt = at(22, 1)
    const s = attemptStatus(sections, at(22, 13), HARD_STOP)
    expect(s.currentPosition).toBe(4)
    expect(s.finished).toBe(true)
  })
})

describe('the 23:59 hard stop overrides everything', () => {
  it('cuts a section short when the hard stop arrives first', () => {
    // Opened at 23:50 with 12 minutes, but only 9 remain before 23:59.
    const sections = freshSections(at(23, 50))
    const s = attemptStatus(sections, at(23, 50), HARD_STOP)
    expect(s.remainingSec).toBe(9 * 60)
  })

  it('finishes the attempt at the hard stop regardless of section', () => {
    const s = attemptStatus(freshSections(at(23, 50)), at(23, 59), HARD_STOP)
    expect(s.finished).toBe(true)
    expect(s.finishReason).toBe('HARD_STOP')
    expect(s.remainingSec).toBe(0)
  })

  it('never reports time past the hard stop for an unopened section', () => {
    const sections = freshSections()
    sections[0]!.startedAt = at(23, 0); sections[0]!.endedAt = at(23, 55); sections[0]!.endReason = 'SUBMITTED'
    // Section 2 has 12 minutes of allowance but only 4 minutes of window.
    const s = attemptStatus(sections, at(23, 55), HARD_STOP)
    expect(s.currentPosition).toBe(2)
    expect(s.remainingSec).toBe(4 * 60)
  })
})

describe('unused time never carries over (FR-6.4.6)', () => {
  it('starts the next section at the moment the previous one closed', () => {
    const sections = freshSections(at(22, 0))
    // Finished Quant in 5 of its 12 minutes.
    const { closed, opened } = advanceSection(sections, at(22, 5), 'SUBMITTED')
    expect(closed!.code).toBe('QUANT')
    expect(closed!.endedAt).toEqual(at(22, 5))
    expect(opened!.code).toBe('REASONING')
    expect(opened!.startedAt).toEqual(at(22, 5))

    // Reasoning gets its own 12 minutes, not 19.
    const next = sections.map((s) =>
      s.position === 1 ? closed! : s.position === 2 ? opened! : s)
    expect(attemptStatus(next, at(22, 5), HARD_STOP).remainingSec).toBe(12 * 60)
  })

  it('returns nothing to open after the final section', () => {
    const sections = freshSections(at(22, 0)).map((s, i) =>
      i < 3 ? { ...s, startedAt: at(22, 0), endedAt: at(22, 1), endReason: 'SUBMITTED' as const } : { ...s, startedAt: at(22, 1) })
    const { closed, opened } = advanceSection(sections, at(22, 10), 'SUBMITTED')
    expect(closed!.code).toBe('PK')
    expect(opened).toBeNull()
  })

  it('does nothing when every section is already closed', () => {
    const sections = freshSections(at(22, 0)).map((s) => ({
      ...s, startedAt: at(22, 0), endedAt: at(22, 5), endReason: 'SUBMITTED' as const,
    }))
    expect(advanceSection(sections, at(22, 10), 'SUBMITTED')).toEqual({ closed: null, opened: null })
  })
})

describe('when a response may be accepted', () => {
  const sections = freshSections(at(22, 0))

  it('accepts one for the open, running section', () => {
    expect(acceptsResponses(attemptStatus(sections, at(22, 5), HARD_STOP), 1)).toBe(true)
  })

  it('refuses one for a section that is not open', () => {
    expect(acceptsResponses(attemptStatus(sections, at(22, 5), HARD_STOP), 2)).toBe(false)
  })

  it('refuses one once the section timer has run out', () => {
    expect(acceptsResponses(attemptStatus(sections, at(22, 12), HARD_STOP), 1)).toBe(false)
  })

  it('refuses one after the hard stop', () => {
    expect(acceptsResponses(attemptStatus(sections, at(23, 59), HARD_STOP), 1)).toBe(false)
  })
})

describe('resuming after a refresh or a crash', () => {
  it('does not refund time lost while disconnected (FR-6.4.8)', () => {
    const sections = freshSections(at(22, 0))
    // Away for four minutes; the clock ran the whole time.
    expect(attemptStatus(sections, at(22, 4), HARD_STOP).remainingSec).toBe(8 * 60)
  })

  it('a client clock cannot extend a section, because it is never consulted', () => {
    const sections = freshSections(at(22, 0))
    const truth = attemptStatus(sections, at(22, 6), HARD_STOP)
    expect(truth.remainingSec).toBe(6 * 60)
  })
})
