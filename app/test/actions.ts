'use server'

import { revalidatePath } from 'next/cache'
import { actionUser } from '../../lib/guard'
import {
  attemptClock, bumpIntegrityCounter, loadAttemptCore, moveToNextSection, recordResponses, submitAttempt,
  writableQuestions, type AttemptCore, type ResponseWrite,
} from '../../lib/repo/attempts'
import { OPTION_LABELS } from '../../lib/types'
import { LIMITS } from '../../lib/rate-limit'
import { hit } from '../../lib/repo/rate-limit'

/**
 * Every action re-checks that the caller owns the attempt and that the section
 * is still open. The client is never trusted about either: a stale tab, a
 * replayed request or a tampered clock must not be able to write into a
 * section whose timer has run out (FR-6.4.7).
 *
 * A student deactivated mid-window may still finish the attempt already
 * running (PRD §11), so these pass allowInactive; starting one does not.
 */
/**
 * Why an action could not go ahead. Kept apart because the engine must react
 * differently: leave for the result page only when the attempt really is
 * over, go to the login page when this device was signed out (another device
 * began or resumed the test, FR-6.1.4), and otherwise keep the answers queued
 * and retry.
 */
type Refusal = 'finished' | 'signed-out' | 'error'

class Refused extends Error {
  constructor(readonly reason: Refusal) { super(reason) }
}

async function authorise(attemptId: string): Promise<AttemptCore> {
  let user
  try {
    user = await actionUser({ allowInactive: true })
  } catch {
    throw new Refused('error')
  }
  if (!user) throw new Refused('signed-out')

  let core
  try {
    core = await loadAttemptCore(attemptId)
  } catch {
    throw new Refused('error')
  }
  if (!core || core.userId !== user.id) throw new Refused('signed-out')
  if (core.state !== 'IN_PROGRESS') throw new Refused('finished')
  return core
}

const refusalOf = (e: unknown): Refusal => (e instanceof Refused ? e.reason : 'error')

/** The authoritative clock, returned by every write (FR-6.4.7). */
export interface ClockReading {
  remainingSec: number
  deadlineMs: number
  serverNowMs: number
  sectionPosition: number | null
  finished: boolean
  /** Set when there is no reading: the engine retries, leaves or logs in. */
  refused?: Refusal
}

const refusedClock = (refused: Refusal): ClockReading =>
  ({ remainingSec: 0, deadlineMs: 0, serverNowMs: 0, sectionPosition: null, finished: refused === 'finished', refused })

/** A queue flush is one section's worth at most; anything larger is not ours. */
const MAX_BATCH = 60

/**
 * Save the whole state of each listed question: opened, answered or flagged.
 *
 * Opening a question is a write too — that is what separates not-reached from
 * skipped (FR-9.1). Only questions in the section the server has open are
 * written; anything else is dropped and reported, never trusted.
 */
export async function saveResponsesAction(
  attemptId: string,
  items: ResponseWrite[],
): Promise<{ ok: boolean; reason?: 'section-closed' | Refusal; saved: string[]; clock: ClockReading }> {
  let core: AttemptCore
  try {
    core = await authorise(attemptId)
  } catch (e) {
    const reason = refusalOf(e)
    return { ok: false, reason, saved: [], clock: refusedClock(reason) }
  }
  try {
    // PRD 13. A limit an honest session never meets (lib/rate-limit.ts); a
    // refusal is reported as a failed save, which the client simply retries.
    if (await hit(`responses:${attemptId}`, LIMITS.responses) > 0) {
      return { ok: false, reason: 'error', saved: [], clock: refusedClock('error') }
    }

    const clean = items.slice(0, MAX_BATCH).filter((it) =>
      typeof it.questionId === 'string'
      && typeof it.isMarked === 'boolean'
      && typeof it.timeSpentSec === 'number' && Number.isFinite(it.timeSpentSec)
      && (it.selectedOption === null || (OPTION_LABELS as readonly string[]).includes(it.selectedOption)))

    const now = new Date()
    const { status, allowed } = await writableQuestions(core, clean.map((it) => it.questionId), now)
    const clock: ClockReading = {
      remainingSec: status.remainingSec,
      deadlineMs: status.deadlineMs,
      serverNowMs: now.getTime(),
      sectionPosition: status.currentPosition,
      finished: status.finished,
    }

    const writable = clean.filter((it) => allowed.has(it.questionId))
    // Nothing writable means the client is looking at a section that is no
    // longer open; it refreshes into the right one.
    if (writable.length === 0) return { ok: false, reason: 'section-closed', saved: [], clock }

    await recordResponses(core.id, writable)
    return { ok: true, saved: writable.map((it) => it.questionId), clock }
  } catch {
    return { ok: false, reason: 'error', saved: [], clock: refusedClock('error') }
  }
}

export async function bumpCounterAction(
  attemptId: string, which: 'fullscreen_exits' | 'tab_switches',
): Promise<void> {
  try {
    await authorise(attemptId)
    await bumpIntegrityCounter(attemptId, which)
  } catch {
    // A counter is deterrence, not evidence. Never fail a live attempt over it.
  }
}

/**
 * Leave `fromPosition` for the next section. A no-op if that section is no
 * longer the open one, so a double click or a timer that beat the click cannot
 * skip a section.
 */
export async function nextSectionAction(
  attemptId: string, fromPosition: number,
): Promise<{ finished: boolean; refused?: Refusal }> {
  let core: AttemptCore
  try {
    core = await authorise(attemptId)
  } catch (e) {
    const refused = refusalOf(e)
    return { finished: refused === 'finished', refused }
  }
  const result = await moveToNextSection(core, fromPosition)
  if (result.finished) await submitAttempt(attemptId, result.submitAs ?? 'AUTO_SUBMITTED')
  revalidatePath(`/test/${attemptId}`)
  return result
}

export async function endTestAction(attemptId: string): Promise<{ refused?: Refusal }> {
  try {
    await authorise(attemptId)
  } catch (e) {
    const refused = refusalOf(e)
    // Already finished is the outcome the caller wanted.
    return refused === 'finished' ? {} : { refused }
  }
  await submitAttempt(attemptId, 'SUBMITTED')
  revalidatePath(`/test/${attemptId}`)
  return {}
}

/** Called when the countdown reaches zero, and when the tab becomes visible. */
export async function syncClockAction(attemptId: string): Promise<ClockReading> {
  // Reads and can submit, so it needs the same ownership check as the rest.
  let core: AttemptCore
  try {
    core = await authorise(attemptId)
  } catch (e) {
    return refusedClock(refusalOf(e))
  }

  const status = await attemptClock(core)
  return {
    remainingSec: status.remainingSec,
    deadlineMs: status.deadlineMs,
    serverNowMs: status.serverNowMs,
    sectionPosition: status.finished ? null : status.currentPosition,
    finished: status.finished,
  }
}
