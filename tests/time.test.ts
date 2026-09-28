import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW,
  addDays,
  canStartAttempt,
  daysBetween,
  entryCloseOffset,
  entryClosesAt,
  entryClosesOn,
  formatIstDate,
  formatIstTime,
  hardStopAt,
  istDate,
  istInstant,
  opensAt,
  paperClosed,
  paperLabels,
  paperWindowProblem,
  windowLabels,
  windowState,
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

  /**
   * This used to be refused, justified by "an attempt finishing on the next
   * calendar day would sit on the wrong date for the archive and the board".
   * That was not so: an attempt belongs to its paper and a paper keeps its own
   * date, so a paper opening on the 28th and finishing at 00:15 on the 29th is
   * still the 28th's paper everywhere it is counted. The limit cost the admin
   * a choice and bought nothing.
   */
  it('allows an entry close that runs the attempt past midnight', () => {
    expect(paperWindowProblem(win(22 * 60, 23 * 60 + 16))).toBeNull()
    expect(paperWindowProblem(win(20 * 60, 23 * 60, 90))).toBeNull()
    expect(paperWindowProblem(win(20 * 60, 22 * 60 + 30, 90))).toBeNull()
    expect(paperWindowProblem(win(22 * 60, 23 * 60 + 15))).toBeNull()
  })

  it('refuses a time that is not on the clock', () => {
    expect(paperWindowProblem(win(-1, 600))).toMatch(/not a time of day/)
    expect(paperWindowProblem(win(0, 90.5))).toMatch(/not a time of day/)
    // Opening is a time on the paper's own date and nothing else.
    expect(paperWindowProblem(win(1440, 1500))).toMatch(/opening time is not a time of day/)
  })

  /**
   * Entry close is minutes from midnight of the paper's own date, so it may
   * run past 1440 and mean the following day: 1500 is 1 AM tomorrow. That is
   * how "opens 10 PM, last entry 1 AM" is expressed, which a time alone could
   * not say.
   */
  it('lets entry close on the following day, but not the one after', () => {
    expect(paperWindowProblem(win(22 * 60, 24 * 60 + 60))).toBeNull()
    expect(paperWindowProblem(win(22 * 60, 2 * 24 * 60 - 1))).toBeNull()
    expect(paperWindowProblem(win(22 * 60, 2 * 24 * 60))).toMatch(/closing time is not a time of day/)
  })

  it('names which day entry closes on, and which date the close belongs to', () => {
    const w = { date: '2026-09-28', opensAtMin: 22 * 60, entryClosesAtMin: 25 * 60, attemptMinutes: 45, endedAt: null }
    expect(paperLabels(w).closes).toBe('1:00 AM next day')
    expect(entryClosesOn(w)).toBe('2026-09-29')
    expect(entryClosesOn({ date: '2026-09-28', entryClosesAtMin: 1395 })).toBe('2026-09-28')
  })

  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-09-28', '2026-09-29')).toBe(1)
    expect(daysBetween('2026-09-28', '2026-09-28')).toBe(0)
    expect(daysBetween('2026-09-29', '2026-09-28')).toBe(-1)
    // Across a month end, where naive arithmetic goes wrong.
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1)
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

describe('a paper an admin ended early', () => {
  const stamp = ist(D, 22, 30).toISOString()
  const ended = { ...W, endedAt: stamp }

  it('is still an ordinary paper until the stamp', () => {
    expect(windowState(ended, ist(D, 21, 0))).toBe('BEFORE_OPEN')
    expect(windowState(ended, ist(D, 22, 15))).toBe('OPEN')
    expect(canStartAttempt(ended, ist(D, 22, 15))).toBe(true)
  })

  it('is closed from the stamp on, whatever its own times say', () => {
    // Entry would otherwise run to 23:15 and the paper to midnight.
    expect(windowState(ended, ist(D, 22, 30))).toBe('CLOSED')
    expect(windowState(ended, ist(D, 23, 0))).toBe('CLOSED')
    expect(canStartAttempt(ended, ist(D, 23, 0))).toBe(false)
    expect(paperClosed(ended, ist(D, 22, 30))).toBe(true)
  })

  it('brings the hard stop forward, which is what stops a running attempt', () => {
    expect(hardStopAt(ended).getTime()).toBe(ist(D, 22, 30).getTime())
  })

  it('can only ever bring the stop forward, never push it out', () => {
    // A stamp after the derived stop -- a stale row, a clock skew -- must not
    // extend the paper past the day its constraint keeps it inside.
    const late = { ...W, endedAt: ist('2026-09-27', 6, 0).toISOString() }
    expect(hardStopAt(late).getTime()).toBe(hardStopAt(W).getTime())
  })

  it('ignores a stamp that is not a date', () => {
    const junk = { ...W, endedAt: 'not a time' }
    expect(hardStopAt(junk).getTime()).toBe(hardStopAt(W).getTime())
    expect(windowState(junk, ist(D, 22, 15))).toBe('OPEN')
  })
})

describe('a window that crosses midnight', () => {
  /**
   * It used to be refused outright: entry close plus the paper's length had to
   * land on or before 24:00, so a 45-minute paper could not take entry after
   * 11:15 PM. Nothing needed that. A paper's instants come from its own
   * opening day, so minute 1455 is a quarter past midnight the next morning,
   * and every state below was already right -- only the check said no.
   */
  const late = {
    date: '2026-09-28', opensAtMin: 23 * 60, entryClosesAtMin: 23 * 60 + 30,
    attemptMinutes: 45, endedAt: null,
  }

  it('is allowed', () => {
    expect(paperWindowProblem(late)).toBeNull()
  })

  it('still refuses a window that closes before it opens', () => {
    expect(paperWindowProblem({ ...late, opensAtMin: 1400, entryClosesAtMin: 600 }))
      .toMatch(/open before it closes/)
  })

  it('puts the hard stop on the following morning', () => {
    // 23:30 + 45 = 00:15 the next day.
    expect(hardStopAt(late).toISOString()).toBe(istInstant('2026-09-29', 0, 15).toISOString())
  })

  it('runs through midnight rather than ending at it', () => {
    expect(windowState(late, istInstant('2026-09-28', 23, 15))).toBe('OPEN')
    expect(windowState(late, istInstant('2026-09-28', 23, 45))).toBe('ENTRY_CLOSED')
    expect(windowState(late, istInstant('2026-09-29', 0, 10))).toBe('ENTRY_CLOSED')
    expect(windowState(late, istInstant('2026-09-29', 0, 20))).toBe('CLOSED')
  })

  it('will not let anybody start after entry closes, even before midnight', () => {
    expect(canStartAttempt(late, istInstant('2026-09-28', 23, 29))).toBe(true)
    expect(canStartAttempt(late, istInstant('2026-09-28', 23, 31))).toBe(false)
  })

  it('labels the hard stop as a time on the next day, not as midnight', () => {
    // "midnight" for 00:15 would be a quarter of an hour out, on the one
    // figure an admin uses to decide whether the window is what they meant.
    expect(paperLabels(late).hardStop).toBe('12:15 AM next day')
    expect(paperLabels({ ...late, entryClosesAtMin: 23 * 60 + 15 }).hardStop).toBe('midnight')
  })
})

/**
 * The schedule form shows two dates -- the day a paper opens and the day entry
 * closes -- and the second is only ever the first or the day after it. The
 * bounds on that second calendar were once worked out from the day the page
 * happened to load with and never moved again, so choosing an earlier opening
 * day left the close calendar refusing the very day just chosen. This is the
 * arithmetic the linked pair runs on.
 */
describe('how far after the opening day entry closes', () => {
  it('is 0 for a window that closes the same night', () => {
    expect(entryCloseOffset('2026-09-29', '2026-09-29')).toBe(0)
  })

  it('is 1 for one that closes the next morning', () => {
    expect(entryCloseOffset('2026-09-29', '2026-09-30')).toBe(1)
  })

  it('crosses a month and a year without special-casing either', () => {
    expect(entryCloseOffset('2026-09-30', '2026-10-01')).toBe(1)
    expect(entryCloseOffset('2026-12-31', '2027-01-01')).toBe(1)
  })

  /**
   * Both ends are clamped because this is also read off a form being edited,
   * where the two dates can briefly disagree -- and a window taking entry for
   * two days would be two papers, not one.
   */
  it('clamps anything wider, and anything backwards', () => {
    expect(entryCloseOffset('2026-09-29', '2026-10-05')).toBe(1)
    expect(entryCloseOffset('2026-09-29', '2026-09-28')).toBe(0)
    expect(entryCloseOffset('2026-09-29', '2020-01-01')).toBe(0)
  })

  it('moves a window with its paper, keeping its shape', () => {
    // What the form does: read the offset, then re-hang it off the new day.
    const carry = (date: string, closes: string, to: string) =>
      addDays(to, entryCloseOffset(date, closes))
    // Closed the same night, still closes the same night.
    expect(carry('2026-09-30', '2026-09-30', '2026-09-29')).toBe('2026-09-29')
    // Closed the next morning, still closes the next morning.
    expect(carry('2026-09-30', '2026-10-01', '2026-09-29')).toBe('2026-09-30')
    // And forwards over a month boundary.
    expect(carry('2026-09-29', '2026-09-30', '2026-10-31')).toBe('2026-11-01')
  })
})
