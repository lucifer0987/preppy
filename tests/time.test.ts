import { describe, expect, it } from 'vitest'
import {
  addDays, answersUnlocked, attemptDeadline, canStartAttempt, formatIstDate,
  formatIstTime, istDate, istInstant, liveTestDate, nextOpenAt, windowState,
} from '../lib/time'

/** An instant expressed in IST civil time, for readable tests. */
const ist = (date: string, hh: number, mm: number) => istInstant(date, hh, mm)
const D = '2026-09-26'

describe('IST conversion', () => {
  it('maps a UTC instant to the right IST calendar date', () => {
    // 18:30 UTC is exactly midnight IST, so the date rolls over there.
    expect(istDate(new Date('2026-09-26T18:29:59Z'))).toBe('2026-09-26')
    expect(istDate(new Date('2026-09-26T18:30:00Z'))).toBe('2026-09-27')
  })

  it('round-trips a civil time through an instant', () => {
    expect(istDate(ist(D, 22, 0))).toBe(D)
    expect(ist(D, 22, 0).toISOString()).toBe('2026-09-26T16:30:00.000Z')
  })
})

describe('the window', () => {
  it('is shut before 22:00', () => {
    expect(windowState(D, ist(D, 21, 59))).toBe('BEFORE_OPEN')
    expect(canStartAttempt(D, ist(D, 21, 59))).toBe(false)
  })

  it('opens exactly at 22:00', () => {
    expect(windowState(D, ist(D, 22, 0))).toBe('OPEN')
    expect(canStartAttempt(D, ist(D, 22, 0))).toBe(true)
  })

  it('still admits an entrant at 23:14', () => {
    expect(canStartAttempt(D, ist(D, 23, 14))).toBe(true)
  })

  it('refuses a new attempt from 23:15 exactly', () => {
    expect(windowState(D, ist(D, 23, 15))).toBe('ENTRY_CLOSED')
    expect(canStartAttempt(D, ist(D, 23, 15))).toBe(false)
  })

  it('closes after the 23:59 hard stop', () => {
    expect(windowState(D, ist(D, 23, 58))).toBe('ENTRY_CLOSED')
    expect(windowState(D, ist(D, 23, 59))).toBe('CLOSED')
  })
})

describe('the 44-minute tail (FR-4.1)', () => {
  it('gives the last possible entrant their full 45 minutes', () => {
    const start = ist(D, 23, 14)
    expect(attemptDeadline(D, start).getTime() - start.getTime()).toBe(45 * 60_000)
    // 23:14 + 45 minutes lands exactly on the 23:59 hard stop.
    expect(attemptDeadline(D, start).getTime()).toBe(ist(D, 23, 59).getTime())
  })

  it('gives an early entrant their full 45 minutes too', () => {
    const start = ist(D, 22, 0)
    expect(attemptDeadline(D, start).getTime()).toBe(ist(D, 22, 45).getTime())
  })

  it('never lets an attempt run past the hard stop', () => {
    // Should not be reachable via canStartAttempt, but the clamp must hold.
    const start = ist(D, 23, 50)
    expect(attemptDeadline(D, start).getTime()).toBe(ist(D, 23, 59).getTime())
  })
})

describe('which paper is live', () => {
  it('is nothing at teatime', () => {
    expect(liveTestDate(ist(D, 16, 0))).toBeNull()
  })

  it('is tonight once the window opens', () => {
    expect(liveTestDate(ist(D, 22, 30))).toBe(D)
    expect(liveTestDate(ist(D, 23, 30))).toBe(D)
  })

  it('is nothing again after the hard stop, even before midnight', () => {
    expect(liveTestDate(ist(D, 23, 59))).toBeNull()
  })

  it('is nothing in the small hours', () => {
    expect(liveTestDate(ist('2026-09-27', 0, 30))).toBeNull()
  })
})

describe('the countdown', () => {
  it('points at tonight when the window has not opened', () => {
    expect(nextOpenAt(ist(D, 9, 0)).getTime()).toBe(ist(D, 22, 0).getTime())
  })

  it('points at tomorrow once tonight has opened', () => {
    expect(nextOpenAt(ist(D, 22, 30)).getTime()).toBe(ist('2026-09-27', 22, 0).getTime())
  })

  it('points at tonight from just after midnight', () => {
    expect(nextOpenAt(ist(D, 0, 5)).getTime()).toBe(ist(D, 22, 0).getTime())
  })
})

describe('answer embargo (FR-4.3)', () => {
  it('keeps answers sealed for a submitted attempt until midnight', () => {
    expect(answersUnlocked(D, ist(D, 23, 30))).toBe(false)
    expect(answersUnlocked(D, ist(D, 23, 59))).toBe(false)
  })

  it('releases them at midnight', () => {
    expect(answersUnlocked(D, ist('2026-09-27', 0, 0))).toBe(true)
  })
})

describe('date helpers', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('adds days across a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('formats for the interface', () => {
    expect(formatIstDate(D)).toBe('26 September 2026')
    expect(formatIstTime(22, 0)).toBe('10:00 PM')
    expect(formatIstTime(23, 15)).toBe('11:15 PM')
    expect(formatIstTime(0, 5)).toBe('12:05 AM')
  })
})
