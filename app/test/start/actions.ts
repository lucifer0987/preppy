'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '../../../lib/auth'
import { authClient } from '../../../lib/supabase/session'
import { db } from '../../../lib/supabase/admin'
import { findAttempt, startAttempt } from '../../../lib/repo/attempts'
import { canStartAttempt, istDate } from '../../../lib/time'

/**
 * Begin. The server stamps started_at here, on this action, not on page load
 * (FR-6.3.1) — otherwise opening the briefing and walking away would burn the
 * clock.
 */
export async function beginAction(formData: FormData) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const testId = String(formData.get('testId'))
  const { data: test } = await db()
    .from('tests').select('id, date, status').eq('id', testId).maybeSingle()
  if (!test) throw new Error('That paper does not exist.')

  // The admin can never hold a counted attempt (FR-5.2).
  const isDryRun = user.role === 'admin'

  if (!isDryRun) {
    if (test.status !== 'SCHEDULED') throw new Error('That paper is not scheduled.')
    if (test.date !== istDate()) throw new Error('That paper is not tonight’s.')
    if (!canStartAttempt(test.date as string)) {
      throw new Error('Entry for tonight closed at 11:15 PM.')
    }
  }

  const existing = await findAttempt(testId, user.id, isDryRun)
  if (existing && existing.state === 'IN_PROGRESS') redirect(`/test/${existing.id}`)
  if (existing && !isDryRun) redirect(`/test/${existing.id}/done`)

  const attemptId = await startAttempt(testId, user.id, isDryRun)

  // FR-6.1.4: an attempt may only be open in one place. Signing the account
  // out everywhere else is done after the attempt exists, so a failure here
  // cannot cost someone a paper they have already started.
  try {
    const supabase = await authClient()
    await supabase.auth.signOut({ scope: 'others' })
  } catch {
    // Best effort. Never block a live attempt on session housekeeping.
  }

  redirect(`/test/${attemptId}`)
}
