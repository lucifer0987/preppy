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
export const ATTEMPT_MINUTES = 45

const minutesOf = (h: number, m: number) => h * 60 + m

/** Entry close plus one paper. Derived, never stored. */
export function hardStopMinutes(w: WindowSettings): number {
  return minutesOf(w.entryCloseHour, w.entryCloseMinute) + ATTEMPT_MINUTES
}

/**
 * Why this window cannot be used, or null. The same rules the database
 * enforces, so the admin form can explain a refusal before submitting it.
 */
export function windowProblem(w: WindowSettings): string | null {
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
  if (hardStopMinutes(w) > 24 * 60) {
    const latest = 24 * 60 - ATTEMPT_MINUTES
    return `Entry must close by ${formatIstTime(Math.floor(latest / 60), latest % 60)}, `
      + `so the last person to start still finishes before midnight.`
  }
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
}

/** The default window a new paper is offered, from the global setting. */
export function defaultPaperWindow(date: string, w: WindowSettings): PaperWindow {
  return {
    date,
    opensAtMin: minutesOf(w.openHour, w.openMinute),
    entryClosesAtMin: minutesOf(w.entryCloseHour, w.entryCloseMinute),
  }
}

export const opensAt = (p: PaperWindow) => istInstant(p.date, 0, p.opensAtMin)
export const entryClosesAt = (p: PaperWindow) => istInstant(p.date, 0, p.entryClosesAtMin)

/**
 * Derived, never stored: entry close plus one paper, so the last possible
 * entrant still gets the full attempt FR-4.1 promises. Expressed as minutes
 * from midnight so a stop of exactly 24:00 stays on the paper's own date.
 */
export const hardStopAt = (p: PaperWindow) =>
  istInstant(p.date, 0, p.entryClosesAtMin + ATTEMPT_MINUTES)

/** Where a paper sits relative to now. */
export function windowState(p: PaperWindow, at: Date = new Date()): WindowState {
  const t = at.getTime()
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

/**
 * When an attempt started at `startedAt` must be submitted by: its own 45
 * minutes, or the paper's hard stop, whichever comes first. The clamp only
 * binds for an attempt started after entry closed, which canStartAttempt
 * refuses.
 */
export function attemptDeadline(p: PaperWindow, startedAt: Date): Date {
  const ownDeadline = startedAt.getTime() + ATTEMPT_MINUTES * 60_000
  return new Date(Math.min(ownDeadline, hardStopAt(p).getTime()))
}

/** The times a paper shows, for display. */
export function paperLabels(p: PaperWindow): { opens: string; closes: string; hardStop: string } {
  const stop = p.entryClosesAtMin + ATTEMPT_MINUTES
  return {
    opens: formatIstTime(Math.floor(p.opensAtMin / 60), p.opensAtMin % 60),
    closes: formatIstTime(Math.floor(p.entryClosesAtMin / 60), p.entryClosesAtMin % 60),
    // 24:00 is midnight at the end of the paper's date, not the start of it.
    hardStop: stop >= 24 * 60 ? 'midnight' : formatIstTime(Math.floor(stop / 60), stop % 60),
  }
}

/** The default times, for the settings form. A paper's own use paperLabels. */
export function windowLabels(w: WindowSettings): { opens: string; closes: string; hardStop: string } {
  return paperLabels({
    date: '1970-01-01',
    opensAtMin: minutesOf(w.openHour, w.openMinute),
    entryClosesAtMin: minutesOf(w.entryCloseHour, w.entryCloseMinute),
  })
}

/** Why this paper window cannot be used, or null. Mirrors the SQL constraint. */
export function paperWindowProblem(p: Pick<PaperWindow, 'opensAtMin' | 'entryClosesAtMin'>): string | null {
  for (const [v, what] of [[p.opensAtMin, 'opening'], [p.entryClosesAtMin, 'closing']] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 1439) return `The ${what} time is not a time of day.`
  }
  if (p.opensAtMin >= p.entryClosesAtMin) return 'Entry must open before it closes.'
  if (p.entryClosesAtMin + ATTEMPT_MINUTES > 24 * 60) {
    const latest = 24 * 60 - ATTEMPT_MINUTES
    return `Entry must close by ${formatIstTime(Math.floor(latest / 60), latest % 60)}, `
      + `so the last person to start still finishes before midnight.`
  }
  return null
}

/** Two papers whose windows overlap, so a student cannot sit both. */
export function windowsOverlap(a: PaperWindow, b: PaperWindow): boolean {
  if (a.date !== b.date) return false
  return a.opensAtMin < b.entryClosesAtMin + ATTEMPT_MINUTES
      && b.opensAtMin < a.entryClosesAtMin + ATTEMPT_MINUTES
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

const pad = (n: number) => String(n).padStart(2, '0')
