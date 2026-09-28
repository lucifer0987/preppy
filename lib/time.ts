/**
 * The daily clock (PRD section 4).
 *
 * Every test state is derived from the wall clock on read, never written by a
 * job (FR-10.1), so unlocking at 22:00 and closing entry at 23:15 cannot fail.
 *
 * India has never observed daylight saving, so IST is a fixed UTC+05:30. That
 * lets all civil-time arithmetic use one offset instead of a timezone library.
 */

import { DEFAULT_PATTERN, patternTotals } from './types'

export const IST_OFFSET_MINUTES = 330

/**
 * The nightly window.
 *
 * Configurable from the admin console and stored in `app_settings`, so a
 * change of schedule is not a deploy. Every function here takes it as an
 * argument rather than reading a module-level constant: passing it in is what
 * makes these pure and testable, and what stops a call site quietly falling
 * back to yesterday's times.
 *
 * The hard stop is not stored. It is always entry close plus one paper's
 * length, so the last possible entrant gets the full attempt FR-4.1 promises.
 * The database refuses a window whose hard stop would cross midnight.
 */
export interface WindowSettings {
  /** When a paper unlocks. */
  openHour: number
  openMinute: number
  /** No attempt may start at or after this. */
  entryCloseHour: number
  entryCloseMinute: number
}

/** What a fresh database starts with, and what tests use unless they say otherwise. */
export const DEFAULT_WINDOW: WindowSettings = {
  openHour: 22,
  openMinute: 0,
  entryCloseHour: 23,
  entryCloseMinute: 15,
}

/** Length of one attempt, in minutes. The four sections must add up to this. */
/**
 * How long one attempt runs *by default* -- the total of the pattern the
 * product shipped with. A paper carries its own length (`PaperWindow.attemptMinutes`,
 * from `tests.attempt_sec`); this is only the fallback for a window being
 * offered before any paper is in hand.
 */
export const DEFAULT_ATTEMPT_MINUTES = patternTotals(DEFAULT_PATTERN).minutes

const minutesOf = (h: number, m: number) => h * 60 + m

/**
 * Why this window cannot be used, or null. The same rules the database
 * enforces, so the admin form can explain a refusal before submitting it.
 */
export function windowProblem(w: WindowSettings, attemptMinutes = DEFAULT_ATTEMPT_MINUTES): string | null {
  for (const [h, m, what] of [
    [w.openHour, w.openMinute, 'opening'],
    [w.entryCloseHour, w.entryCloseMinute, 'closing'],
  ] as const) {
    if (!Number.isInteger(h) || h < 0 || h > 23) return `The ${what} hour must be between 0 and 23.`
    if (!Number.isInteger(m) || m < 0 || m > 59) return `The ${what} minute must be between 0 and 59.`
  }
  if (minutesOf(w.openHour, w.openMinute) >= minutesOf(w.entryCloseHour, w.entryCloseMinute)) {
    return 'Entry must open before it closes.'
  }
  // As for a paper's own window: running past midnight is allowed, and which
  // day a paper belongs to is its date rather than the hours it occupies.
  return null
}

export type WindowState =
  /** Before 22:00 on the test's own date. */
  | 'BEFORE_OPEN'
  /** 22:00 to 23:15 — attempts may start. */
  | 'OPEN'
  /** 23:15 to midnight — running attempts continue, no new ones. */
  | 'ENTRY_CLOSED'
  /** From midnight — finished; answers are unlocked. */
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

/** Minutes since IST midnight, to compare against a paper's window columns. */
export function istMinuteOfDay(at: Date = new Date()): number {
  const p = istParts(at)
  return p.hour * 60 + p.minute
}

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDate(at: Date = new Date()): string {
  const p = istParts(at)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/**
 * The instant at which a given IST civil time occurs. Hour 24 means midnight
 * at the end of `date`; Date.UTC rolls it into the next day.
 */
export function istInstant(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Not a YYYY-MM-DD date: ${date}`)
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MINUTES * 60_000)
}

/**
 * A paper's own window: the date it runs on, and two times expressed as
 * minutes from midnight IST.
 *
 * Per paper since migration 0003. More than one paper can run in a day, so
 * the date no longer identifies a window and nothing keys off the calendar
 * day any more: a paper's answers unlock, it joins the leaderboard, and it
 * enters the archive all at its own hard stop.
 */
export interface PaperWindow {
  date: string
  opensAtMin: number
  entryClosesAtMin: number
  /**
   * How long one attempt at this paper runs: the sum of its sections, from
   * `tests.attempt_sec`. Required rather than optional, because a window whose
   * length quietly defaulted to 45 would give a 90-minute paper the wrong hard
   * stop and cut its last entrant off halfway.
   */
  attemptMinutes: number
  /**
   * When an admin ended this paper early, as an ISO instant, or null.
   *
   * It beats every derived time on the paper: no new attempt may start, a
   * running one stops here, and answers, the archive and the leaderboard open
   * from this moment rather than from entry close plus one paper.
   */
  endedAt?: string | null
}

/** The instant an early end took effect, or null. */
const endedAtMs = (p: PaperWindow): number | null => {
  if (!p.endedAt) return null
  const t = Date.parse(p.endedAt)
  return Number.isFinite(t) ? t : null
}

/** The default window a new paper is offered, from the global setting. */
export function defaultPaperWindow(
  date: string, w: WindowSettings, attemptMinutes = DEFAULT_ATTEMPT_MINUTES,
): PaperWindow {
  return {
    date,
    opensAtMin: minutesOf(w.openHour, w.openMinute),
    entryClosesAtMin: minutesOf(w.entryCloseHour, w.entryCloseMinute),
    attemptMinutes,
  }
}

/**
 * How late entry may close, as minutes from midnight of the paper's own date.
 *
 * One full day past its own midnight: entry opening on the 28th may close at
 * any time up to 23:59 on the 29th. Beyond that the window stops describing a
 * night and starts describing a holiday, and the date field is the honest way
 * to say so.
 */
export const MAX_ENTRY_CLOSE_MIN = 2 * 24 * 60 - 1

/** Whole days between two YYYY-MM-DD dates, b minus a. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/**
 * Which day entry closes on, relative to the day the paper opens: 0 for the
 * same night, 1 for the following morning. Never anything else -- a window
 * that took entry for two days would be two papers.
 *
 * Clamped rather than trusted, because it is also read off a form mid-edit,
 * where the two dates can briefly disagree.
 */
export function entryCloseOffset(date: string, closesOn: string): number {
  return Math.min(1, Math.max(0, daysBetween(date, closesOn)))
}

/** The date entry closes on, which is the paper's own unless it runs past midnight. */
export const entryClosesOn = (p: Pick<PaperWindow, 'date' | 'entryClosesAtMin'>) =>
  addDays(p.date, Math.floor(p.entryClosesAtMin / (24 * 60)))

export const opensAt = (p: PaperWindow) => istInstant(p.date, 0, p.opensAtMin)
export const entryClosesAt = (p: PaperWindow) => istInstant(p.date, 0, p.entryClosesAtMin)

/**
 * Derived, never stored: entry close plus one paper, so the last possible
 * entrant still gets the full attempt FR-4.1 promises. Expressed as minutes
 * from midnight so a stop of exactly 24:00 stays on the paper's own date.
 */
export const hardStopAt = (p: PaperWindow) => {
  const ended = endedAtMs(p)
  const derived = istInstant(p.date, 0, p.entryClosesAtMin + p.attemptMinutes)
  // An admin ending the paper can only bring the stop forward. Taking the
  // earlier of the two means a stale ended_at can never extend a paper.
  return ended === null ? derived : new Date(Math.min(ended, derived.getTime()))
}

/** Where a paper sits relative to now. */
export function windowState(p: PaperWindow, at: Date = new Date()): WindowState {
  const t = at.getTime()
  // An explicit end beats the times on the paper: entry close may still be
  // hours away, and the paper is over all the same.
  const ended = endedAtMs(p)
  if (ended !== null && t >= ended) return 'CLOSED'
  if (t < opensAt(p).getTime()) return 'BEFORE_OPEN'
  if (t < entryClosesAt(p).getTime()) return 'OPEN'
  if (t < hardStopAt(p).getTime()) return 'ENTRY_CLOSED'
  return 'CLOSED'
}

/** Whether a new attempt may begin for this paper (FR-4.1). */
export function canStartAttempt(p: PaperWindow, at: Date = new Date()): boolean {
  return windowState(p, at) === 'OPEN'
}

/**
 * Everything that used to wait for midnight now waits for this: the paper's
 * own hard stop, when every attempt on it has had to end.
 *
 * Answers and solutions unlock here (FR-4.3), the paper joins the leaderboard
 * here, and it appears in the archive here. Before it, the paper counts for
 * nothing that compares one student with another, so nobody can read off the
 * board who has already sat it (FR-5.3).
 */
export function paperClosed(p: PaperWindow, at: Date = new Date()): boolean {
  return at.getTime() >= hardStopAt(p).getTime()
}

/** The times a paper shows, for display. */
export function paperLabels(p: PaperWindow): { opens: string; closes: string; hardStop: string } {
  const stop = p.entryClosesAtMin + p.attemptMinutes
  return {
    opens: formatIstTime(Math.floor(p.opensAtMin / 60), p.opensAtMin % 60),
    closes: p.entryClosesAtMin >= 24 * 60
      ? `${formatIstTime(Math.floor((p.entryClosesAtMin - 24 * 60) / 60), p.entryClosesAtMin % 60)} next day`
      : formatIstTime(Math.floor(p.entryClosesAtMin / 60), p.entryClosesAtMin % 60),
    // 24:00 is midnight at the end of the paper's date, not the start of it.
    // Exactly 24:00 is midnight. Past it the time belongs to the next morning,
    // and calling that "midnight" would be out by however long it runs -- on
    // the one figure an admin reads to check the window is what they meant.
    hardStop: stop === 24 * 60
      ? 'midnight'
      : stop > 24 * 60
        ? `${formatIstTime(Math.floor((stop - 24 * 60) / 60), stop % 60)} next day`
        : formatIstTime(Math.floor(stop / 60), stop % 60),
  }
}

/** The default times, for the settings form. A paper's own use paperLabels. */
export function windowLabels(
  w: WindowSettings, attemptMinutes = DEFAULT_ATTEMPT_MINUTES,
): { opens: string; closes: string; hardStop: string } {
  return paperLabels(defaultPaperWindow('1970-01-01', w, attemptMinutes))
}

/** Why this paper window cannot be used, or null. Mirrors the SQL constraint. */
export function paperWindowProblem(
  p: Pick<PaperWindow, 'opensAtMin' | 'entryClosesAtMin' | 'attemptMinutes'>,
): string | null {
  if (!Number.isInteger(p.opensAtMin) || p.opensAtMin < 0 || p.opensAtMin > 1439) {
    return 'The opening time is not a time of day.'
  }
  // Entry close is minutes from midnight of the paper's own date, and may run
  // past 1440 -- the same arithmetic the hard stop has always used. 1500 is
  // 1 AM the next morning, which is a window an admin may reasonably want and
  // could not previously express.
  if (!Number.isInteger(p.entryClosesAtMin) || p.entryClosesAtMin < 0
      || p.entryClosesAtMin > MAX_ENTRY_CLOSE_MIN) {
    return 'The closing time is not a time of day.'
  }
  if (p.opensAtMin >= p.entryClosesAtMin) return 'Entry must open before it closes.'
  // A paper may run past midnight, and this used to refuse it: entry close plus
  // the paper's length had to land on or before 24:00, which made the calendar
  // decide the window rather than the admin. Nothing needed it. A paper's
  // instants come from its own opening day, so a hard stop of 24:15 has always
  // meant a quarter past midnight and every state has always been right.
  // A paper belongs to its date, not to the hours it occupies.
  return null
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** "10:00 PM" style, for the interface. */
export function formatIstTime(hour: number, minute: number): string {
  // Hour 24 is the midnight hard stop: 12:00 AM, not noon.
  const hh = hour % 24
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const h = hh % 12 === 0 ? 12 : hh % 12
  return `${h}:${pad(minute)} ${suffix}`
}

/** "26 September 2026" — how a paper's date is shown. */
export function formatIstDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

/**
 * "27 September 2026 at 6:52 AM" -- an instant, read in IST.
 *
 * Every date on screen is a civil IST date, so a raw toLocaleString would
 * read the viewer's own timezone and print seconds nobody asked for.
 */
export function formatIstMoment(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const p = istParts(d)
  return `${formatIstDate(istDate(d))} at ${formatIstTime(p.hour, p.minute)}`
}

const pad = (n: number) => String(n).padStart(2, '0')
