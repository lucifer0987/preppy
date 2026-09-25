import type { SectionCode } from './types'

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
 * @param hardStop 23:59 on the paper's date; nothing may run past it
 */
export function attemptStatus(sections: SectionProgress[], now: Date, hardStop: Date): AttemptStatus {
  const ordered = [...sections].sort((a, b) => a.position - b.position)
  const open = ordered.find((s) => s.endedAt === null)

  if (!open) {
    return {
      currentPosition: null, remainingSec: 0, sectionExpired: false,
      finished: true, finishReason: 'ALL_SECTIONS_DONE',
    }
  }

  if (now.getTime() >= hardStop.getTime()) {
    return {
      currentPosition: open.position, remainingSec: 0, sectionExpired: true,
      finished: true, finishReason: 'HARD_STOP',
    }
  }

  // A section that has not been opened yet has its full allowance ahead of it.
  if (!open.startedAt) {
    return {
      currentPosition: open.position,
      remainingSec: cappedRemaining(open.durationSec, now, hardStop),
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
    sectionExpired: remainingSec <= 0,
    // Running out of time on the final section ends the attempt.
    finished: remainingSec <= 0 && isLast,
    finishReason: remainingSec <= 0 && isLast ? 'ALL_SECTIONS_DONE' : null,
  }
}

function cappedRemaining(durationSec: number, now: Date, hardStop: Date): number {
  const toHardStop = Math.floor((hardStop.getTime() - now.getTime()) / 1000)
  return Math.max(0, Math.min(durationSec, toHardStop))
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

/** Whether a response may still be accepted for this section right now. */
export function acceptsResponses(status: AttemptStatus, position: number): boolean {
  return !status.finished && status.currentPosition === position && !status.sectionExpired
}
