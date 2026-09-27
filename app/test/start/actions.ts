'use server'

import { redirect } from 'next/navigation'
import { actionUser } from '../../../lib/guard'
import { currentSessionId, revokeSessions } from '../../../lib/auth'
import { db } from '../../../lib/supabase/admin'
import { findAttempt, loadAttempt, startAttempt } from '../../../lib/repo/attempts'
import { entryRefusal } from './entry'
import { paperWindowOf } from '../../../lib/repo/papers'

/**
 * Begin. The server stamps started_at here, on this action, not on page load
 * (FR-6.3.1) — otherwise opening the briefing and walking away would burn the
 * clock.
 */
export async function beginAction(formData: FormData) {
  // Active required: a deactivated student may finish a running attempt but
  // never start one (PRD §11).
  const user = await actionUser()
  if (!user) redirect('/login')

  const testId = String(formData.get('testId'))
  // A refusal goes back to the briefing as a message, not to an error page.
  const refuse = (message: string): never =>
    redirect(`/test/start?test=${encodeURIComponent(testId)}&error=${encodeURIComponent(message)}`)

  const { data: test } = await db()
    .from('tests').select('id, status, date, opens_at_min, entry_closes_at_min, attempt_sec, ended_at').eq('id', testId).maybeSingle()
  if (!test) redirect('/dashboard')

  // The admin can never hold a counted attempt (FR-5.2).
  const isDryRun = user.role === 'admin'

  const existing = await findAttempt(testId, user.id, isDryRun)
  if (existing && existing.state === 'IN_PROGRESS') {
    // Resume it — unless its clock ran out while nobody was looking, in which
    // case reading it scores it, and a dry run may then start afresh.
    const snapshot = await loadAttempt(existing.id as string)
    if (snapshot && !snapshot.status.finished) redirect(`/test/${existing.id}`)
    if (!isDryRun) redirect(`/test/${existing.id}/done`)
  }
  if (existing && !isDryRun) redirect(`/test/${existing.id}/done`)

  if (!isDryRun) {
    const why = entryRefusal(test.status as string, paperWindowOf(test))
    if (why) refuse(why)
  }

  let attemptId: string
  try {
    attemptId = await startAttempt(testId, user.id, isDryRun)
  } catch (e) {
    refuse((e as Error).message)
  }

  // FR-6.1.4: an attempt may only be open in one place, so every other
  // session on the account ends now. Done after the attempt exists, so a
  // failure here cannot cost someone a paper they have already started.
  // Without this session's id, revoking would sign out this device too.
  try {
    const keep = await currentSessionId()
    if (keep) await revokeSessions(user.id, keep)
  } catch (e) {
    console.error('[begin] could not sign out other sessions', (e as Error).message)
  }

  redirect(`/test/${attemptId!}`)
}
