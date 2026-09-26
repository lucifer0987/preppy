import type { SectionCode } from './types'
import { hardStopAt, type PaperWindow } from './time'

/**
 * The sectional timer state machine (PRD section 6.4).
 *
 * Pure on purpose. The server owns the clock (FR-6.4.7), so every decision
 * about which section is open and how long is left is derived here from
 * stored timestamps and the current instant — never from anything the client
 * reports. The client renders a countdown for display only.
 *
 * A section ends when its own timer expires or the student moves on early.
 * Unused time never carries over (FR-6.4.6): the next section starts its full
 * allowance from the moment the previous one ended.
 */

export type SectionEndReason = 'SUBMITTED' | 'TIMER_EXPIRED' | 'FORCE_CLOSED'

export interface SectionProgress {
  code: SectionCode
  position: number
  durationSec: number
  startedAt: Date | null
  endedAt: Date | null
  endReason: SectionEndReason | null
}

export interface AttemptStatus {
  /** Position of the open section, or null when the attempt is over. */
  currentPosition: number | null
  /** Whole seconds left in the open section. Zero when it has run out. */
  remainingSec: number
  /**
   * The instant (epoch ms) the open section ends: its own allowance or the
   * hard stop, whichever is first. The client counts down to this rather than
   * decrementing a number, so a throttled tab cannot drift. Zero when over.
   */
  deadlineMs: number
  /**
   * True when the open section's allowance has elapsed. The caller must close
   * it and open the next one before accepting any further response.
   */
  sectionExpired: boolean
  /** True when the whole attempt should be submitted now. */
  finished: boolean
  /** Why the attempt ended, when it has. */
  finishReason: 'ALL_SECTIONS_DONE' | 'HARD_STOP' | null
}

/**
 * @param sections in ascending position order
 * @param now      the server's instant
 * @param hardStop from attemptHardStop; nothing may run past it
 */
export function attemptStatus(sections: SectionProgress[], now: Date, hardStop: Date): AttemptStatus {
  const ordered = effectiveRows(sections, hardStop)
  const open = ordered.find((s) => s.endedAt === null)

  if (!open) {
    return {
      currentPosition: null, remainingSec: 0, deadlineMs: 0, sectionExpired: false,
      finished: true, finishReason: 'ALL_SECTIONS_DONE',
    }
  }

  if (now.getTime() >= hardStop.getTime()) {
    return {
      currentPosition: open.position, remainingSec: 0, deadlineMs: hardStop.getTime(), sectionExpired: true,
      finished: true, finishReason: 'HARD_STOP',
    }
  }

  // A section that has not been opened yet has its full allowance ahead of it.
  if (!open.startedAt) {
    const remainingSec = cappedRemaining(open.durationSec, now, hardStop)
    return {
      currentPosition: open.position,
      remainingSec,
      deadlineMs: now.getTime() + remainingSec * 1000,
      sectionExpired: false, finished: false, finishReason: null,
    }
  }

  const elapsedSec = Math.floor((now.getTime() - open.startedAt.getTime()) / 1000)
  const leftInSection = open.durationSec - elapsedSec
  const leftToHardStop = Math.floor((hardStop.getTime() - now.getTime()) / 1000)
  const remainingSec = Math.max(0, Math.min(leftInSection, leftToHardStop))
  const isLast = open.position === ordered[ordered.length - 1]!.position

  return {
    currentPosition: open.position,
    remainingSec,
    deadlineMs: sectionDeadline(open, hardStop)!.getTime(),
    sectionExpired: remainingSec <= 0,
    // Running out of time on the final section ends the attempt.
    finished: remainingSec <= 0 && isLast,
    finishReason: remainingSec <= 0 && isLast ? 'ALL_SECTIONS_DONE' : null,
  }
}

/**
 * The rows sorted, with one repair: a section whose predecessor has closed but
 * which was never stamped as started is treated as starting the instant its
 * predecessor ended. Moving on writes the close and the next start
 * separately; if the second write were lost, the section would otherwise sit
 * open with no clock at all, and never expire. Deriving the start from the
 * stored close makes that state heal itself on the next read, and it is
 * exactly the start the student would have had.
 */
export function effectiveRows(sections: SectionProgress[], hardStop: Date): SectionProgress[] {
  const out = [...sections].sort((a, b) => a.position - b.position).map((s) => ({ ...s }))
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!
    const cur = out[i]!
    if (!cur.startedAt && !cur.endedAt && prev.endedAt && prev.endedAt.getTime() < hardStop.getTime()) {
      cur.startedAt = prev.endedAt
    }
  }
  return out
}

/**
 * Saves already on their way when a section's timer runs out are still taken,
 * for this long. The client sends answers after a 300 ms pause and the network
 * adds its own delay, so an answer chosen in the last second would otherwise
 * arrive a moment late and be dropped. Only for a section that ran out of time:
 * one the student chose to leave was flushed before leaving.
 */
export const EXPIRY_GRACE_MS = 3000

/**
 * The sections whose questions may be written right now: the open one, and
 * one that ran out of time within the grace period.
 */
export function writablePositions(sections: SectionProgress[], now: Date, hardStop: Date): Set<number> {
  const out = new Set<number>()
  const t = now.getTime()
  for (const s of effectiveRows(sections, hardStop)) {
    const deadline = sectionDeadline(s, hardStop)
    if (!deadline || t < s.startedAt!.getTime()) continue
    const leftEarly = s.endedAt !== null && s.endReason === 'SUBMITTED'
    if (leftEarly) continue
    if (t < deadline.getTime() + EXPIRY_GRACE_MS) out.add(s.position)
  }
  return out
}

function cappedRemaining(durationSec: number, now: Date, hardStop: Date): number {
  const toHardStop = Math.floor((hardStop.getTime() - now.getTime()) / 1000)
  return Math.max(0, Math.min(durationSec, toHardStop))
}

/**
 * When nothing about this attempt may run past.
 *
 * A counted attempt stops at its paper's hard stop (lib/time). A dry run can be taken
 * on any day, of any paper (FR-6.9.2), so the paper's date means nothing to it;
 * it stops when its own allowance would, measured from its own Begin.
 */
export function attemptHardStop(a: {
  isDryRun: boolean; window: PaperWindow; startedAt: Date; sections: Pick<SectionProgress, 'durationSec'>[]
}): Date {
  if (!a.isDryRun) return hardStopAt(a.window)
  const totalSec = a.sections.reduce((n, s) => n + s.durationSec, 0)
  return new Date(a.startedAt.getTime() + totalSec * 1000)
}

/** When a started section must end: its own allowance, capped at the hard stop. */
export function sectionDeadline(s: SectionProgress, hardStop: Date): Date | null {
  if (!s.startedAt) return null
  return new Date(Math.min(s.startedAt.getTime() + s.durationSec * 1000, hardStop.getTime()))
}

/**
 * Close every section whose deadline has passed, each at its own deadline, and
 * open the next at that same instant.
 *
 * Deterministic in the stored timestamps: two requests racing through here
 * compute identical rows, so neither can start a section late. A section is
 * labelled by what actually ended it — its own timer (TIMER_EXPIRED) or the
 * hard stop cutting it short (FORCE_CLOSED) — not by when someone noticed. No
 * section is opened at or after the hard stop; those stay never-started, which
 * is what "not reached" means.
 */
export function rollForward(sections: SectionProgress[], now: Date, hardStop: Date): SectionProgress[] {
  const out = effectiveRows(sections, hardStop)
  for (;;) {
    const i = out.findIndex((s) => s.endedAt === null)
    if (i === -1) return out
    const open = out[i]!
    const deadline = sectionDeadline(open, hardStop)
    if (!deadline || now.getTime() < deadline.getTime()) return out

    const ownEnd = open.startedAt!.getTime() + open.durationSec * 1000
    open.endedAt = deadline
    open.endReason = ownEnd <= hardStop.getTime() ? 'TIMER_EXPIRED' : 'FORCE_CLOSED'
    const next = out[i + 1]
    if (!next || deadline.getTime() >= hardStop.getTime()) return out
    next.startedAt = deadline
  }
}

/**
 * The section rows as they should stand once the attempt is submitted.
 *
 * Expired sections are rolled forward first, so each closes at its own
 * deadline rather than at the moment of submission. The section still running
 * closes now. Sections never reached keep a null started_at and ended_at —
 * they were never opened — and carry FORCE_CLOSED only so the row says why.
 */
export function closeForSubmit(
  sections: SectionProgress[], now: Date, hardStop: Date, reason: 'SUBMITTED' | 'AUTO_SUBMITTED',
): SectionProgress[] {
  return rollForward(sections, now, hardStop).map((s) => {
    if (s.endedAt !== null) return s
    if (s.startedAt === null) return { ...s, endReason: 'FORCE_CLOSED' as const }
    const deadline = sectionDeadline(s, hardStop)!
    const endedAt = new Date(Math.min(now.getTime(), deadline.getTime()))
    return { ...s, endedAt, endReason: reason === 'SUBMITTED' ? 'SUBMITTED' as const : 'FORCE_CLOSED' as const }
  })
}

/**
 * Time actually spent: the sum of each section's own span. Not submitted_at
 * minus started_at, which would charge a student whose browser died at 22:10
 * for every hour until a finalise run found the attempt.
 */
export function timeSpentSec(sections: SectionProgress[]): number {
  let ms = 0
  for (const s of sections) {
    if (s.startedAt && s.endedAt) ms += Math.max(0, s.endedAt.getTime() - s.startedAt.getTime())
  }
  return Math.round(ms / 1000)
}

/**
 * Close the open section and open the next, returning the rows to write.
 *
 * The next section's clock starts at the same instant the previous one closed,
 * which is what makes unused time non-transferable.
 */
export function advanceSection(
  sections: SectionProgress[],
  at: Date,
  reason: SectionEndReason,
): { closed: SectionProgress | null; opened: SectionProgress | null } {
  const ordered = [...sections].sort((a, b) => a.position - b.position)
  const openIndex = ordered.findIndex((s) => s.endedAt === null)
  if (openIndex === -1) return { closed: null, opened: null }

  const closed: SectionProgress = { ...ordered[openIndex]!, endedAt: at, endReason: reason }
  const next = ordered[openIndex + 1]
  const opened: SectionProgress | null = next ? { ...next, startedAt: at } : null
  return { closed, opened }
}


