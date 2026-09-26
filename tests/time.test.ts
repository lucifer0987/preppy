import { describe, expect, it } from 'vitest'
import {
  addDays, canStartAttempt, DEFAULT_WINDOW, entryClosesAt, formatIstDate,
  formatIstTime, hardStopAt, istDate, istInstant, opensAt, paperClosed, paperLabels,
  paperWindowProblem, windowLabels, windowState, windowsOverlap,
} from '../lib/time'
import { attemptHardStop } from '../lib/attempt'

/** An instant expressed in IST civil time, for readable tests. */
const ist = (date: string, hh: number, mm: number) => istInstant(date, hh, mm)
const D = '2026-09-26'
/** The default window, on D. */
const W = { date: D, opensAtMin: 22 * 60, entryClosesAtMin: 23 * 60 + 15, attemptMinutes: 45 }

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
    expect(windowState(W, ist(D, 21, 59))).toBe('BEFORE_OPEN')
    expect(canStartAttempt(W, ist(D, 21, 59))).toBe(false)
  })

  it('opens exactly at 22:00', () => {
    expect(windowState(W, ist(D, 22, 0))).toBe('OPEN')
    expect(canStartAttempt(W, ist(D, 22, 0))).toBe(true)
  })

  it('still admits an entrant at 23:14', () => {
    expect(canStartAttempt(W, ist(D, 23, 14))).toBe(true)
  })

  it('refuses a new attempt from 23:15 exactly', () => {
    expect(windowState(W, ist(D, 23, 15))).toBe('ENTRY_CLOSED')
    expect(canStartAttempt(W, ist(D, 23, 15))).toBe(false)
  })

  it('keeps running attempts going until midnight, then closes', () => {
    expect(windowState(W, ist(D, 23, 58))).toBe('ENTRY_CLOSED')
    expect(windowState(W, ist(D, 23, 59))).toBe('ENTRY_CLOSED')
    expect(windowState(W, ist('2026-09-27', 0, 0))).toBe('CLOSED')
  })
})

describe('the last entrant gets a whole paper (FR-4.1)', () => {
  it('puts the hard stop at midnight at the end of the paper date', () => {
    expect(hardStopAt(W).getTime()).toBe(ist('2026-09-27', 0, 0).getTime())
    // Answers unlock at the same instant, when nothing can still be running.
    expect(paperClosed(W, hardStopAt(W))).toBe(true)
  })

  it('leaves exactly one paper between the last entry and the hard stop', () => {
    // This is the guarantee, and it is structural rather than checked: the hard
    // stop is *defined* as entry close plus the paper's length, so the person
    // who starts at the last possible instant still has all of it.
    for (const minutes of [20, 45, 90, 150]) {
      const w = { ...W, entryClosesAtMin: 24 * 60 - minutes, attemptMinutes: minutes }
      expect(hardStopAt(w).getTime() - entryClosesAt(w).getTime()).toBe(minutes * 60_000)
    }
  })

  it('still admits an entrant a millisecond before entry closes', () => {
    expect(canStartAttempt(W, new Date(ist(D, 23, 15).getTime() - 1))).toBe(true)
    expect(canStartAttempt(W, ist(D, 23, 15))).toBe(false)
  })

  it('caps a counted attempt at the paper hard stop, whenever it started', () => {
    // What the live path actually asks. An early starter is not cut short by
    // this -- their section timers run out long before it.
    const sections = [{ durationSec: 12 * 60 }, { durationSec: 12 * 60 },
                      { durationSec: 9 * 60 }, { durationSec: 12 * 60 }]
    for (const start of [ist(D, 22, 0), ist(D, 23, 14), new Date(ist(D, 23, 15).getTime() - 1)]) {
      expect(attemptHardStop({ isDryRun: false, window: W, startedAt: start, sections }))
        .toEqual(hardStopAt(W))
    }
  })
})

describe('which paper is live', () => {
  it('is shut before its opening time', () => {
    expect(windowState(W, ist(D, 21, 59))).toBe('BEFORE_OPEN')
  })

  it('is live from opening until its hard stop', () => {
    expect(windowState(W, ist(D, 22, 30))).toBe('OPEN')
    expect(windowState(W, ist(D, 23, 30))).toBe('ENTRY_CLOSED')
  })

  it('is finished once the hard stop passes', () => {
    // Midnight at the end of D, expressed as 24:00 so it stays on D.
    expect(windowState(W, ist('2026-09-27', 0, 0))).toBe('CLOSED')
  })

  it('leaves two papers on one day independent', () => {
    const morning = { date: D, opensAtMin: 6 * 60, entryClosesAtMin: 7 * 60, attemptMinutes: 45 }
    const evening = W
    // 07:30: the morning paper's entry has closed but attempts run to 07:45.
    expect(windowState(morning, ist(D, 7, 30))).toBe('ENTRY_CLOSED')
    expect(windowState(evening, ist(D, 7, 30))).toBe('BEFORE_OPEN')

    // 08:00: the morning paper is finished and the evening one still waiting.
    expect(windowState(morning, ist(D, 8, 0))).toBe('CLOSED')
    expect(windowState(evening, ist(D, 8, 0))).toBe('BEFORE_OPEN')
  })
})

describe('answers and the board wait for the paper, not the day (FR-4.3)', () => {
  it('keeps both sealed while the paper is still running', () => {
    expect(paperClosed(W, ist(D, 23, 30))).toBe(false)
    expect(paperClosed(W, ist(D, 23, 59))).toBe(false)
  })

  it('opens both the moment the last attempt has had to end', () => {
    expect(paperClosed(W, ist('2026-09-27', 0, 0))).toBe(true)
  })

  it('opens a morning paper that same morning, not at midnight', () => {
    // The whole point of moving off the calendar day: a paper that ran at
    // breakfast is reviewable by mid-morning.
    const morning = { date: D, opensAtMin: 6 * 60, entryClosesAtMin: 7 * 60, attemptMinutes: 45 }
    expect(paperClosed(morning, ist(D, 7, 44))).toBe(false)
    expect(paperClosed(morning, ist(D, 7, 45))).toBe(true)
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

describe('two papers in one day', () => {
  const morning = { date: D, opensAtMin: 6 * 60, entryClosesAtMin: 7 * 60, attemptMinutes: 45 }
  const evening = { date: D, opensAtMin: 22 * 60, entryClosesAtMin: 23 * 60, attemptMinutes: 45 }

  it('does not call well-separated windows an overlap', () => {
    expect(windowsOverlap(morning, evening)).toBe(false)
  })

  it('counts the running time, not just entry, when judging an overlap', () => {
    // Entry closes at 07:00 but attempts run to 07:45, so a paper opening at
    // 07:30 clashes even though entry never overlaps.
    const tooSoon = { date: D, opensAtMin: 7 * 60 + 30, entryClosesAtMin: 8 * 60, attemptMinutes: 45 }
    expect(windowsOverlap(morning, tooSoon)).toBe(true)
    expect(windowsOverlap(tooSoon, morning)).toBe(true)
  })

  it('allows one to start exactly as the other finishes', () => {
    const after = { date: D, opensAtMin: 7 * 60 + 45, entryClosesAtMin: 8 * 60 + 30, attemptMinutes: 45 }
    expect(windowsOverlap(morning, after)).toBe(false)
  })

  it('never calls papers on different days an overlap', () => {
    expect(windowsOverlap(morning, { ...morning, date: '2026-09-27' })).toBe(false)
  })
})

describe('a configurable window', () => {
  const morning = { date: D, opensAtMin: 6 * 60, entryClosesAtMin: 7 * 60 + 30, attemptMinutes: 45 }

  it('opens and closes where it is told', () => {
    expect(windowState(morning, ist(D, 5, 59))).toBe('BEFORE_OPEN')
    expect(windowState(morning, ist(D, 6, 0))).toBe('OPEN')
    expect(windowState(morning, ist(D, 7, 29))).toBe('OPEN')
    expect(windowState(morning, ist(D, 7, 30))).toBe('ENTRY_CLOSED')
  })

  it('still gives the last entrant a full paper', () => {
    // Entry closes at 07:30, so the last entrant still has the whole 45.
    expect(hardStopAt(morning).getTime()).toBe(ist(D, 8, 15).getTime())
    expect(hardStopAt(morning).getTime() - entryClosesAt(morning).getTime()).toBe(45 * 60_000)
  })

  it('closes for good at its own hard stop, not at midnight', () => {
    expect(windowState(morning, ist(D, 8, 14))).toBe('ENTRY_CLOSED')
    expect(windowState(morning, ist(D, 8, 15))).toBe('CLOSED')
  })

  it('opens and closes at its own instants', () => {
    expect(opensAt(morning).getTime()).toBe(ist(D, 6, 0).getTime())
    expect(entryClosesAt(morning).getTime()).toBe(ist(D, 7, 30).getTime())
  })
})

describe('which windows are allowed', () => {
  const win = (opensAtMin: number, entryClosesAtMin: number, attemptMinutes = 45) =>
    ({ date: D, opensAtMin, entryClosesAtMin, attemptMinutes })

  it('accepts the default', () => {
    expect(paperWindowProblem(win(22 * 60, 23 * 60 + 15))).toBeNull()
  })

  it('refuses a close that is not after the open', () => {
    expect(paperWindowProblem(win(23 * 60 + 30, 23 * 60 + 15))).toMatch(/open before it closes/)
    expect(paperWindowProblem(win(22 * 60, 22 * 60))).toMatch(/open before it closes/)
  })

  it('refuses an entry close that would run an attempt past midnight', () => {
    // The whole reason for the limit: an attempt finishing on the next
    // calendar day would sit on the wrong date for the archive and the board.
    expect(paperWindowProblem(win(22 * 60, 23 * 60 + 16))).toMatch(/45-minute paper must close entry by 11:15 PM/)
    // A longer paper has to close entry earlier, and the message says which.
    expect(paperWindowProblem(win(20 * 60, 23 * 60, 90))).toMatch(/90-minute paper must close entry by 10:30 PM/)
    expect(paperWindowProblem(win(20 * 60, 22 * 60 + 30, 90))).toBeNull()
    expect(paperWindowProblem(win(22 * 60, 23 * 60 + 15))).toBeNull()
  })

  it('refuses a time that is not on the clock', () => {
    expect(paperWindowProblem(win(-1, 600))).toMatch(/not a time of day/)
    expect(paperWindowProblem(win(0, 1440))).toMatch(/not a time of day/)
    expect(paperWindowProblem(win(0, 90.5))).toMatch(/not a time of day/)
  })

  it('allows a paper first thing in the morning', () => {
    expect(paperWindowProblem(win(0, 60))).toBeNull()
  })

  it('agrees with the database, which rejects the same windows', () => {
    // tests/schema.test.ts asserts the SQL constraints; this pins the message
    // the admin sees to the same rules.
    expect(paperWindowProblem(win(0, 23 * 60 + 15))).toBeNull()
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
