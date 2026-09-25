'use server'

import { revalidatePath } from 'next/cache'
import { currentUser } from '../../lib/auth'
import { db } from '../../lib/supabase/admin'
import {
  bumpIntegrityCounter, loadAttempt, moveToNextSection, recordResponse, submitAttempt,
} from '../../lib/repo/attempts'
import { acceptsResponses } from '../../lib/attempt'
import type { OptionLabel } from '../../lib/types'

/**
 * Every action re-checks that the caller owns the attempt and that the section
 * is still open. The client is never trusted about either: a stale tab, a
 * replayed request or a tampered clock must not be able to write into a
 * section whose timer has run out (FR-6.4.7).
 */
async function authorise(attemptId: string) {
  const user = await currentUser()
  if (!user) throw new Error('Not signed in.')

  const { data } = await db()
    .from('attempts').select('user_id, state').eq('id', attemptId).maybeSingle()
  if (!data || data.user_id !== user.id) throw new Error('That attempt is not yours.')
  if (data.state !== 'IN_PROGRESS') throw new Error('That attempt is already finished.')
  return user
}

export async function saveResponseAction(
  attemptId: string,
  questionId: string,
  sectionPosition: number,
  patch: { selectedOption?: OptionLabel | null; isMarked?: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  try {
    await authorise(attemptId)
    const snapshot = await loadAttempt(attemptId)
    if (!snapshot) return { ok: false, reason: 'gone' }
    if (!acceptsResponses(snapshot.status, sectionPosition)) {
      // The section closed underneath them; the page will refresh into the next one.
      return { ok: false, reason: 'section-closed' }
    }
    await recordResponse(attemptId, questionId, patch)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/** Writing the row on open is what separates not-reached from skipped. */
export async function visitQuestionAction(
  attemptId: string, questionId: string, sectionPosition: number,
): Promise<{ ok: boolean }> {
  try {
    await authorise(attemptId)
    const snapshot = await loadAttempt(attemptId)
    if (!snapshot || !acceptsResponses(snapshot.status, sectionPosition)) return { ok: false }
    await recordResponse(attemptId, questionId, {})
    return { ok: true }
  } catch {
    return { ok: false }
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

export async function nextSectionAction(attemptId: string): Promise<{ finished: boolean }> {
  await authorise(attemptId)
  const result = await moveToNextSection(attemptId)
  if (result.finished) await submitAttempt(attemptId, 'SUBMITTED')
  revalidatePath(`/test/${attemptId}`)
  return result
}

export async function endTestAction(attemptId: string): Promise<void> {
  await authorise(attemptId)
  await submitAttempt(attemptId, 'SUBMITTED')
  revalidatePath(`/test/${attemptId}`)
}

/** Called by the client when the server-issued countdown reaches zero. */
export async function syncClockAction(attemptId: string): Promise<{
  remainingSec: number; sectionPosition: number | null; finished: boolean
}> {
  // Reads and can submit, so it needs the same ownership check as the rest.
  // authorise throws once the attempt is finished, which is the answer the
  // caller wants anyway.
  try {
    await authorise(attemptId)
  } catch {
    return { remainingSec: 0, sectionPosition: null, finished: true }
  }

  const snapshot = await loadAttempt(attemptId)
  if (!snapshot) return { remainingSec: 0, sectionPosition: null, finished: true }
  if (snapshot.status.finished) {
    await submitAttempt(attemptId, 'AUTO_SUBMITTED')
    return { remainingSec: 0, sectionPosition: null, finished: true }
  }
  return {
    remainingSec: snapshot.status.remainingSec,
    sectionPosition: snapshot.status.currentPosition,
    finished: false,
  }
}
