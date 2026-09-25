'use server'

import { redirect } from 'next/navigation'
import { currentUser, signIn } from '../../lib/auth'
import { authClient } from '../../lib/supabase/session'
import { db } from '../../lib/supabase/admin'
import type { ChangePasswordState } from './state'

const MIN_LENGTH = 8

/**
 * Changing your own password (FR-6.1.2).
 *
 * The current password is required even on the forced first change. They typed
 * it moments ago, so it costs nothing, and it stops someone walking up to an
 * unlocked laptop and taking the account.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState, formData: FormData,
): Promise<ChangePasswordState> {
  const user = await currentUser()
  if (!user) redirect('/login')

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

  // Re-authenticate rather than trusting the session alone.
  const check = await signIn(user.username, current)
  if (!check.ok) return { error: 'That is not your current password.' }

  const supabase = await authClient()
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: `Could not change it: ${error.message}` }

  await db().from('profiles').update({ must_change_password: false }).eq('id', user.id)

  redirect(user.role === 'admin' ? '/admin?password=changed' : '/dashboard?password=changed')
}
