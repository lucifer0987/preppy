/**
 * The daily clock (PRD section 4).
 *
 * Every test state is derived from the wall clock on read, never written by a
 * job (FR-10.1), so unlocking at 22:00 and closing entry at 23:15 cannot fail.
 *
 * India has never observed daylight saving, so IST is a fixed UTC+05:30. That
 * lets all civil-time arithmetic use one offset instead of a timezone library.
 */

export const IST_OFFSET_MINUTES = 330

/** Admin settings, not constants (PRD section 4 flag) — widen the window here. */
export const WINDOW = {
  /** Test unlocks. */
  openHour: 22,
  openMinute: 0,
  /** No attempt may start at or after this. */
  entryCloseHour: 23,
  entryCloseMinute: 15,
  /** Every attempt is force-submitted by here. */
  hardStopHour: 23,
  hardStopMinute: 59,
  /** Length of one attempt. */
  durationMinutes: 45,
} as const

export type WindowState =
  /** Before 22:00 on the test's own date. */
  | 'BEFORE_OPEN'
  /** 22:00 to 23:15 — attempts may start. */
  | 'OPEN'
  /** 23:15 to 23:59 — running attempts continue, no new ones. */
  | 'ENTRY_CLOSED'
  /** After 23:59 — finished; answers unlock at midnight. */
  | 'CLOSED'

export interface IstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Civil IST fields for an instant. */
export function istParts(at: Date = new Date()): IstParts {
  const s = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000)
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    second: s.getUTCSeconds(),
  }
}

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDate(at: Date = new Date()): string {
  const p = istParts(at)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** The instant at which a given IST civil time occurs. */
export function istInstant(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Not a YYYY-MM-DD date: ${date}`)
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MINUTES * 60_000)
}

export const opensAt = (date: string) => istInstant(date, WINDOW.openHour, WINDOW.openMinute)
export const entryClosesAt = (date: string) => istInstant(date, WINDOW.entryCloseHour, WINDOW.entryCloseMinute)
export const hardStopAt = (date: string) => istInstant(date, WINDOW.hardStopHour, WINDOW.hardStopMinute)

/** Where a given test date sits relative to now. */
export function windowState(date: string, at: Date = new Date()): WindowState {
  const t = at.getTime()
  if (t < opensAt(date).getTime()) return 'BEFORE_OPEN'
  if (t < entryClosesAt(date).getTime()) return 'OPEN'
  if (t < hardStopAt(date).getTime()) return 'ENTRY_CLOSED'
  return 'CLOSED'
}

/**
 * The test date that is live right now, or null.
 *
 * A paper dated D is live from D 22:00 until D 23:59, so between midnight and
 * 22:00 nothing is live even though the calendar date has already advanced.
 */
export function liveTestDate(at: Date = new Date()): string | null {
  const today = istDate(at)
  return windowState(today, at) === 'CLOSED' || windowState(today, at) === 'BEFORE_OPEN' ? null : today
}

/** Whether a new attempt may begin for this paper (FR-4.1). */
export function canStartAttempt(date: string, at: Date = new Date()): boolean {
  return windowState(date, at) === 'OPEN'
}

/**
 * When an attempt started at `startedAt` must be submitted by: its own 45
 * minutes, or the 23:59 hard stop, whichever comes first.
 */
export function attemptDeadline(date: string, startedAt: Date): Date {
  const ownDeadline = startedAt.getTime() + WINDOW.durationMinutes * 60_000
  return new Date(Math.min(ownDeadline, hardStopAt(date).getTime()))
}

/** The next moment a paper unlocks, counting from now. */
export function nextOpenAt(at: Date = new Date()): Date {
  const today = istDate(at)
  const todayOpen = opensAt(today)
  if (at.getTime() < todayOpen.getTime()) return todayOpen
  return opensAt(addDays(today, 1))
}

/** Answers and solutions unlock at midnight after the paper's date (FR-4.3). */
export function answersUnlockAt(date: string): Date {
  return istInstant(addDays(date, 1), 0, 0)
}

export function answersUnlocked(date: string, at: Date = new Date()): boolean {
  return at.getTime() >= answersUnlockAt(date).getTime()
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** "10:00 PM" style, for the interface. */
export function formatIstTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${pad(minute)} ${suffix}`
}

/** "26 September 2026" — how a paper's date is shown. */
export function formatIstDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

const pad = (n: number) => String(n).padStart(2, '0')
