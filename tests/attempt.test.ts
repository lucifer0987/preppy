import { describe, expect, it } from 'vitest'
import {
  EXPIRY_GRACE_MS, advanceSection, attemptHardStop, attemptStatus, closeForSubmit, effectiveRows, rollForward,
  sectionDeadline, timeSpentSec, writablePositions, type SectionProgress,
} from '../lib/attempt'
import { hardStopAt, istInstant } from '../lib/time'

const D = '2026-09-26'
const W = { date: D, opensAtMin: 22 * 60, entryClosesAtMin: 23 * 60 + 15, attemptMinutes: 45 }
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
  const writable = (rows: SectionProgress[], now: Date) => [...writablePositions(rows, now, HARD_STOP)]

  it('accepts one for the open, running section only', () => {
    expect(writable(sections, at(22, 5))).toEqual([1])
  })

  it('still takes a save that was on its way when the timer ran out', () => {
    // Quant ran out at 22:12; a save arriving a second later is honoured,
    // and Reasoning, now open, is writable too.
    const rolled = rollForward(sections, at(22, 12, 1), HARD_STOP)
    expect(writable(rolled, at(22, 12, 1)).sort()).toEqual([1, 2])
  })

  it('refuses one once the grace period has passed', () => {
    const late = new Date(at(22, 12).getTime() + EXPIRY_GRACE_MS)
    expect(writable(rollForward(sections, late, HARD_STOP), late)).toEqual([2])
  })

  it('gives no grace to a section the student chose to leave', () => {
    const { closed, opened } = advanceSection(sections, at(22, 5), 'SUBMITTED')
    const rows = sections.map((s) => s.position === 1 ? closed! : s.position === 2 ? opened! : s)
    expect(writable(rows, at(22, 5, 1))).toEqual([2])
  })

  it('refuses everything after the hard stop and its grace', () => {
    const late = new Date(HARD_STOP.getTime() + EXPIRY_GRACE_MS)
    expect(writable(freshSections(at(23, 50)), late)).toEqual([])
  })
})

describe('a section whose start was never stamped', () => {
  // Moving on writes the close and the next start separately. If the second
  // write is lost, the section must not sit open with no clock.
  const broken = (): SectionProgress[] => {
    const rows = freshSections(at(22, 0))
    rows[0] = { ...rows[0]!, endedAt: at(22, 5), endReason: 'SUBMITTED' }
    return rows // Reasoning: never stamped as started
  }

  it('starts when its predecessor ended', () => {
    expect(effectiveRows(broken(), HARD_STOP)[1]!.startedAt).toEqual(at(22, 5))
  })

  it('therefore runs out on time rather than never', () => {
    const s = attemptStatus(broken(), at(22, 17), HARD_STOP)
    expect(s.currentPosition).toBe(2)
    expect(s.sectionExpired).toBe(true)
    const rolled = rollForward(broken(), at(22, 17), HARD_STOP)
    expect(rolled[1]).toMatchObject({ startedAt: at(22, 5), endedAt: at(22, 17), endReason: 'TIMER_EXPIRED' })
  })

  it('leaves a section that follows an open one alone', () => {
    expect(effectiveRows(freshSections(at(22, 0)), HARD_STOP)[1]!.startedAt).toBeNull()
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

describe('the deadline the client counts down to', () => {
  it('is the open section\'s own end', () => {
    const s = attemptStatus(freshSections(at(22, 0)), at(22, 5), HARD_STOP)
    expect(s.deadlineMs).toBe(at(22, 12).getTime())
  })

  it('is cut to the hard stop when that comes first', () => {
    const s = attemptStatus(freshSections(at(23, 50)), at(23, 51), HARD_STOP)
    expect(s.deadlineMs).toBe(HARD_STOP.getTime())
  })

  it('is exact, not rounded to the second', () => {
    const s = attemptStatus(freshSections(at(22, 0)), at(22, 0, 0.4), HARD_STOP)
    expect(s.deadlineMs).toBe(at(22, 12).getTime())
  })
})

describe('dry runs are not bound to the paper\'s date', () => {
  const sections = freshSections()

  it('a counted attempt stops at its paper\'s hard stop', () => {
    expect(attemptHardStop({ isDryRun: false, window: W, startedAt: at(22, 0), sections })).toEqual(hardStopAt(W))
  })

  it('a dry run stops its own 45 minutes after Begin', () => {
    // A paper from days ago, rehearsed today: long past its own hard stop.
    const begin = new Date(HARD_STOP.getTime() + 3 * 86_400_000)
    const stop = attemptHardStop({ isDryRun: true, window: W, startedAt: begin, sections })
    expect(stop.getTime() - begin.getTime()).toBe(45 * 60_000)
    const s = attemptStatus(freshSections(begin), new Date(begin.getTime() + 60_000), stop)
    expect(s.finished).toBe(false)
    expect(s.remainingSec).toBe(11 * 60)
  })
})

describe('rolling forward past expired sections', () => {
  it('closes each section at its own deadline and opens the next then, not now', () => {
    // Laptop closed at 22:01, reopened at 22:30.
    const rolled = rollForward(freshSections(at(22, 0)), at(22, 30), HARD_STOP)
    expect(rolled[0]).toMatchObject({ endedAt: at(22, 12), endReason: 'TIMER_EXPIRED' })
    expect(rolled[1]).toMatchObject({ startedAt: at(22, 12), endedAt: at(22, 24), endReason: 'TIMER_EXPIRED' })
    expect(rolled[2]).toMatchObject({ startedAt: at(22, 24), endedAt: null })
    expect(attemptStatus(rolled, at(22, 30), HARD_STOP).remainingSec).toBe(3 * 60)
  })

  it('changes nothing while the open section is still running', () => {
    const sections = freshSections(at(22, 0))
    expect(rollForward(sections, at(22, 11), HARD_STOP)).toEqual(sections)
  })

  it('labels a section by what ended it, even when noticed after 23:59', () => {
    // Quant ran out at 23:42 on its own; Reasoning was cut short at 23:59.
    const rolled = rollForward(freshSections(at(23, 30)), at(23, 59, 3660), HARD_STOP)
    expect(rolled[0]).toMatchObject({ endedAt: at(23, 42), endReason: 'TIMER_EXPIRED' })
    expect(rolled[1]).toMatchObject({ startedAt: at(23, 42), endedAt: at(23, 54), endReason: 'TIMER_EXPIRED' })
    expect(rolled[2]).toMatchObject({ startedAt: at(23, 54), endedAt: HARD_STOP, endReason: 'FORCE_CLOSED' })
  })

  it('never opens a section at the hard stop', () => {
    const rolled = rollForward(freshSections(at(23, 30)), at(23, 59, 3660), HARD_STOP)
    expect(rolled[3]).toMatchObject({ startedAt: null, endedAt: null })
  })

  it('does not mutate its input', () => {
    const sections = freshSections(at(22, 0))
    rollForward(sections, at(22, 30), HARD_STOP)
    expect(sections[0]!.endedAt).toBeNull()
  })
})

describe('closing everything at submission', () => {
  it('ends the running section now when the student submits', () => {
    const sections = freshSections()
    for (const s of sections.slice(0, 3)) { s.startedAt = at(22, 0); s.endedAt = at(22, 1); s.endReason = 'SUBMITTED' }
    sections[3]!.startedAt = at(22, 1)
    const closed = closeForSubmit(sections, at(22, 5), HARD_STOP, 'SUBMITTED')
    expect(closed[3]).toMatchObject({ endedAt: at(22, 5), endReason: 'SUBMITTED' })
  })

  it('an attempt abandoned at 22:01 and scored at 01:00 closes at its deadlines', () => {
    const closed = closeForSubmit(freshSections(at(22, 0)), at(23, 59, 3660), HARD_STOP, 'AUTO_SUBMITTED')
    expect(closed.map((s) => s.endedAt)).toEqual([at(22, 12), at(22, 24), at(22, 33), at(22, 45)])
    expect(closed.every((s) => s.endReason === 'TIMER_EXPIRED')).toBe(true)
    // 45 minutes, not two hours.
    expect(timeSpentSec(closed)).toBe(45 * 60)
  })

  it('leaves never-reached sections unstarted', () => {
    const closed = closeForSubmit(freshSections(at(23, 50)), at(23, 59, 3660), HARD_STOP, 'AUTO_SUBMITTED')
    expect(closed[0]).toMatchObject({ endedAt: HARD_STOP, endReason: 'FORCE_CLOSED' })
    for (const s of closed.slice(1)) {
      expect(s).toMatchObject({ startedAt: null, endedAt: null, endReason: 'FORCE_CLOSED' })
    }
    expect(timeSpentSec(closed)).toBe(9 * 60)
  })
})

describe('time spent', () => {
  it('sums the sections actually spent, early finishes included', () => {
    const sections = freshSections(at(22, 0))
    const { closed, opened } = advanceSection(sections, at(22, 5), 'SUBMITTED')
    const next = sections.map((s) => s.position === 1 ? closed! : s.position === 2 ? { ...opened!, endedAt: at(22, 7) } : s)
    expect(timeSpentSec(next)).toBe(7 * 60)
  })

  it('a section never started contributes nothing', () => {
    expect(timeSpentSec(freshSections())).toBe(0)
    expect(sectionDeadline(freshSections()[0]!, HARD_STOP)).toBeNull()
  })
})
