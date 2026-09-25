'use server'

import { redirect } from 'next/navigation'
import { revokeSessions, signIn } from '../../lib/auth'
import { requireAnySignedIn } from '../../lib/guard'
import { LIMITS, retryMessage } from '../../lib/rate-limit'
import { hit, waitFor } from '../../lib/repo/rate-limit'
import { authClient } from '../../lib/supabase/session'
import { db } from '../../lib/supabase/admin'
import type { ChangePasswordState } from './state'

const MIN_LENGTH = 8

/**
 * Changing your own password (FR-6.1.2).
 *
 * The current password is required even on the forced first change. They typed
 * it moments ago, so it costs nothing, and it stops someone walking up to an
 * unlocked laptop and taking the account. Wrong guesses count against the
 * same per-account limit as the login form, so this is no side door for a
 * guesser.
 *
 * Every other session on the account ends here: a password change is often
 * because someone else knows the old one.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState, formData: FormData,
): Promise<ChangePasswordState> {
  // Signed in and active; a forced change is exactly what this is for, so the
  // must-change flag is not a refusal here (lib/guard.ts).
  const user = await requireAnySignedIn()

  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('next') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (next.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters.` }
  }
  if (next !== confirm) {
    return { error: 'The two new passwords do not match.' }
  }
  if (next === current) {
    return { error: 'That is the password you already have. Pick a different one.' }
  }

  const limitKey = `login:user:${user.username}`
  const wait = await waitFor(limitKey, LIMITS.loginByUsername)
  if (wait > 0) return { error: retryMessage(wait) }

  // Re-authenticate rather than trusting the session alone. This also replaces
  // this device's session with a fresh one.
  const check = await signIn(user.username, current)
  if (!check.ok) {
    await hit(limitKey, LIMITS.loginByUsername)
    return { error: 'That is not your current password.' }
  }

  const supabase = await authClient()
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: `Could not change it: ${error.message}` }

  // Every other device is signed out at once; this one keeps the session the
  // check above just opened. Without that session's id, revoking would sign
  // out this device too, so it is skipped.
  try {
    if (check.ok && check.sessionId) await revokeSessions(user.id, check.sessionId)
  } catch (e) {
    console.error('[change-password]', (e as Error).message)
  }

  await db().from('profiles').update({ must_change_password: false }).eq('id', user.id)

  redirect(user.role === 'admin' ? '/admin?password=changed' : '/dashboard?password=changed')
}
