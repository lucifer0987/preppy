import { describe, expect, it } from 'vitest'
import {
  addDays, answersUnlockAt, answersUnlocked, attemptDeadline, hardStopAt, canStartAttempt, formatIstDate,
  formatIstTime, istDate, istInstant, liveTestDate, nextOpenAt, windowState,
  boardIncludesAt, latestBoardDate, onBoard, DEFAULT_WINDOW, windowProblem, windowLabels,
} from '../lib/time'

/** An instant expressed in IST civil time, for readable tests. */
const ist = (date: string, hh: number, mm: number) => istInstant(date, hh, mm)
const W = DEFAULT_WINDOW
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
    expect(windowState(D, W, ist(D, 21, 59))).toBe('BEFORE_OPEN')
    expect(canStartAttempt(D, W, ist(D, 21, 59))).toBe(false)
  })

  it('opens exactly at 22:00', () => {
    expect(windowState(D, W, ist(D, 22, 0))).toBe('OPEN')
    expect(canStartAttempt(D, W, ist(D, 22, 0))).toBe(true)
  })

  it('still admits an entrant at 23:14', () => {
    expect(canStartAttempt(D, W, ist(D, 23, 14))).toBe(true)
  })

  it('refuses a new attempt from 23:15 exactly', () => {
    expect(windowState(D, W, ist(D, 23, 15))).toBe('ENTRY_CLOSED')
    expect(canStartAttempt(D, W, ist(D, 23, 15))).toBe(false)
  })

  it('keeps running attempts going until midnight, then closes', () => {
    expect(windowState(D, W, ist(D, 23, 58))).toBe('ENTRY_CLOSED')
    expect(windowState(D, W, ist(D, 23, 59))).toBe('ENTRY_CLOSED')
    expect(windowState(D, W, ist('2026-09-27', 0, 0))).toBe('CLOSED')
  })
})

describe('the 45-minute tail (FR-4.1)', () => {
  it('puts the hard stop at midnight at the end of the paper date', () => {
    expect(hardStopAt(D, W).getTime()).toBe(ist('2026-09-27', 0, 0).getTime())
    expect(hardStopAt(D, W).getTime()).toBe(answersUnlockAt(D).getTime())
  })

  it('gives the 23:14 entrant their full 45 minutes', () => {
    const start = ist(D, 23, 14)
    expect(attemptDeadline(D, W, start).getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('gives the 23:14:30 entrant their full 45 minutes too', () => {
    const start = new Date(ist(D, 23, 14).getTime() + 30_000)
    expect(canStartAttempt(D, W, start)).toBe(true)
    expect(attemptDeadline(D, W, start).getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('gives the very last possible entrant their full 45 minutes', () => {
    const start = new Date(ist(D, 23, 15).getTime() - 1)
    expect(canStartAttempt(D, W, start)).toBe(true)
    expect(attemptDeadline(D, W, start).getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('gives an early entrant their full 45 minutes too', () => {
    const start = ist(D, 22, 0)
    expect(attemptDeadline(D, W, start).getTime()).toBe(ist(D, 22, 45).getTime())
  })

  it('never lets an attempt run past the hard stop', () => {
    // Should not be reachable via canStartAttempt, but the clamp must hold.
    const start = ist(D, 23, 50)
    expect(attemptDeadline(D, W, start).getTime()).toBe(ist('2026-09-27', 0, 0).getTime())
  })
})

describe('which paper is live', () => {
  it('is nothing at teatime', () => {
    expect(liveTestDate(W, ist(D, 16, 0))).toBeNull()
  })

  it('is tonight once the window opens', () => {
    expect(liveTestDate(W, ist(D, 22, 30))).toBe(D)
    expect(liveTestDate(W, ist(D, 23, 30))).toBe(D)
  })

  it('is still tonight in the last minute before midnight', () => {
    expect(liveTestDate(W, ist(D, 23, 59))).toBe(D)
  })

  it('is nothing from midnight', () => {
    expect(liveTestDate(W, ist('2026-09-27', 0, 0))).toBeNull()
  })

  it('is nothing in the small hours', () => {
    expect(liveTestDate(W, ist('2026-09-27', 0, 30))).toBeNull()
  })
})

describe('the countdown', () => {
  it('points at tonight when the window has not opened', () => {
    expect(nextOpenAt(W, ist(D, 9, 0)).getTime()).toBe(ist(D, 22, 0).getTime())
  })

  it('points at tomorrow once tonight has opened', () => {
    expect(nextOpenAt(W, ist(D, 22, 30)).getTime()).toBe(ist('2026-09-27', 22, 0).getTime())
  })

  it('points at tonight from just after midnight', () => {
    expect(nextOpenAt(W, ist(D, 0, 5)).getTime()).toBe(ist(D, 22, 0).getTime())
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
    expect(formatIstTime(24, 0)).toBe('12:00 AM')
    expect(formatIstTime(0, 5)).toBe('12:05 AM')
    expect(formatIstTime(0, 5)).toBe('12:05 AM')
  })
})

describe('the leaderboard refresh at 00:01', () => {
  it('takes in a paper at 00:01 the morning after, not at midnight', () => {
    expect(onBoard('2026-09-26', istInstant('2026-09-27', 0, 0))).toBe(false)
    expect(onBoard('2026-09-26', istInstant('2026-09-27', 0, 1))).toBe(true)
    expect(boardIncludesAt('2026-09-26').toISOString()).toBe('2026-09-26T18:31:00.000Z')
  })

  it('keeps tonight off the board while it runs', () => {
    expect(onBoard('2026-09-26', istInstant('2026-09-26', 22, 30))).toBe(false)
    expect(latestBoardDate(istInstant('2026-09-26', 22, 30))).toBe('2026-09-25')
  })

  it('moves the latest paper on at 00:01, not before', () => {
    expect(latestBoardDate(istInstant('2026-09-27', 0, 0))).toBe('2026-09-25')
    expect(latestBoardDate(istInstant('2026-09-27', 0, 1))).toBe('2026-09-26')
    expect(latestBoardDate(istInstant('2026-09-27', 21, 0))).toBe('2026-09-26')
  })
})

describe('a configurable window', () => {
  const morning = { openHour: 6, openMinute: 0, entryCloseHour: 7, entryCloseMinute: 30 }

  it('opens and closes where it is told', () => {
    expect(windowState(D, morning, ist(D, 5, 59))).toBe('BEFORE_OPEN')
    expect(windowState(D, morning, ist(D, 6, 0))).toBe('OPEN')
    expect(windowState(D, morning, ist(D, 7, 29))).toBe('OPEN')
    expect(windowState(D, morning, ist(D, 7, 30))).toBe('ENTRY_CLOSED')
  })

  it('still gives the last entrant a full paper', () => {
    // 07:29:59 plus 45 minutes is 08:14:59, and the hard stop is 08:15.
    expect(hardStopAt(D, morning).getTime()).toBe(ist(D, 8, 15).getTime())
    const start = ist(D, 7, 29)
    expect(attemptDeadline(D, morning, start).getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('closes for good at its own hard stop, not at midnight', () => {
    expect(windowState(D, morning, ist(D, 8, 14))).toBe('ENTRY_CLOSED')
    expect(windowState(D, morning, ist(D, 8, 15))).toBe('CLOSED')
  })

  it('points the countdown at its own opening time', () => {
    expect(nextOpenAt(morning, ist(D, 5, 0)).getTime()).toBe(ist(D, 6, 0).getTime())
    expect(nextOpenAt(morning, ist(D, 9, 0)).getTime()).toBe(ist('2026-09-27', 6, 0).getTime())
  })
})

describe('which windows are allowed', () => {
  it('accepts the default', () => {
    expect(windowProblem(DEFAULT_WINDOW)).toBeNull()
  })

  it('refuses a close that is not after the open', () => {
    expect(windowProblem({ openHour: 23, openMinute: 30, entryCloseHour: 23, entryCloseMinute: 15 }))
      .toMatch(/open before it closes/)
    expect(windowProblem({ openHour: 22, openMinute: 0, entryCloseHour: 22, entryCloseMinute: 0 }))
      .toMatch(/open before it closes/)
  })

  it('refuses an entry close that would run an attempt past midnight', () => {
    // The whole reason for the limit: an attempt finishing on the next
    // calendar day would sit on the wrong date for the archive and the board.
    expect(windowProblem({ ...DEFAULT_WINDOW, entryCloseHour: 23, entryCloseMinute: 16 }))
      .toMatch(/Entry must close by 11:15 PM/)
    expect(windowProblem({ ...DEFAULT_WINDOW, entryCloseHour: 23, entryCloseMinute: 15 })).toBeNull()
  })

  it('refuses a time that is not on the clock', () => {
    expect(windowProblem({ ...DEFAULT_WINDOW, openHour: 24 })).toMatch(/between 0 and 23/)
    expect(windowProblem({ ...DEFAULT_WINDOW, openMinute: 60 })).toMatch(/between 0 and 59/)
    expect(windowProblem({ ...DEFAULT_WINDOW, openMinute: 1.5 })).toMatch(/between 0 and 59/)
  })

  it('agrees with the database, which rejects the same windows', () => {
    // tests/schema.test.ts asserts the SQL constraints; this pins the message
    // the admin sees to the same rules.
    expect(windowProblem({ openHour: 0, openMinute: 0, entryCloseHour: 23, entryCloseMinute: 15 })).toBeNull()
  })
})

describe('labels for display', () => {
  it('names the three moments', () => {
    expect(windowLabels(DEFAULT_WINDOW)).toEqual({
      opens: '10:00 PM', closes: '11:15 PM', hardStop: 'midnight',
    })
  })

  it('says a real time when the stop is not midnight', () => {
    expect(windowLabels({ openHour: 6, openMinute: 0, entryCloseHour: 7, entryCloseMinute: 30 }).hardStop)
      .toBe('8:15 AM')
  })
})
