import 'server-only'
import { selectAll } from './select-all'
import { db } from '../supabase/admin'
import { generatePassword } from '../password'
import { revokeSessions } from '../auth'
import { USERNAME_PATTERN, normaliseUsername, usernameToEmail } from '../username'

/**
 * Accounts (PRD 6.9.3). Created only by an admin; there is no sign-up.
 *
 * Passwords are generated here and returned once. There is no email on file to
 * send them to, which is the deliberate consequence of collecting no email.
 */

export interface UserRow {
  id: string
  username: string
  displayName: string
  role: 'student' | 'admin'
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  attemptCount: number
}

export { generatePassword } from '../password'

export async function listUsers(): Promise<UserRow[]> {
  const client = db()
  const { data: profiles } = await client
    .from('profiles')
    .select('id, username, display_name, role, is_active, must_change_password, last_login_at')
    .order('role').order('username')

  // Papers that count: finished and not voided, as on the leaderboard. Paged,
  // because this is every counted attempt ever taken: five students sitting one
  // paper a night pass PostgREST's 1,000-row cap inside a year, and a capped
  // response looks exactly like a complete one -- the count would simply stop
  // growing.
  const attempts = await selectAll<{ user_id: string }>('attempt counts', (from, to) =>
    client.from('attempts').select('user_id')
      .eq('is_dry_run', false).in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])
      .order('id').range(from, to))

  const counts = new Map<string, number>()
  for (const a of attempts) {
    counts.set(a.user_id, (counts.get(a.user_id) ?? 0) + 1)
  }

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    username: p.username as string,
    displayName: p.display_name as string,
    role: p.role as 'student' | 'admin',
    isActive: p.is_active as boolean,
    mustChangePassword: p.must_change_password as boolean,
    lastLoginAt: (p.last_login_at as string | null) ?? null,
    attemptCount: counts.get(p.id as string) ?? 0,
  }))
}

export async function createUser(
  usernameInput: string, displayName: string, role: 'student' | 'admin',
): Promise<{ username: string; password: string }> {
  const username = normaliseUsername(usernameInput)
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('A username is 3 to 20 characters, using lowercase letters, numbers and underscores.')
  }
  if (!displayName.trim()) throw new Error('Give them a display name.')

  const client = db()
  const { data: taken } = await client.from('profiles').select('id').eq('username', username).maybeSingle()
  if (taken) throw new Error(`The username "${username}" is already in use.`)

  const password = generatePassword()
  const { data, error } = await client.auth.admin.createUser({
    email: usernameToEmail(username), password, email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Could not create the account: ${error?.message ?? 'unknown error'}`)

  const { error: profileError } = await client.from('profiles').insert({
    id: data.user.id, username, display_name: displayName.trim(), role, must_change_password: true,
  })
  if (profileError) {
    // Never leave an auth user without a profile: login would half-work.
    await client.auth.admin.deleteUser(data.user.id)
    throw new Error(`Could not create the account: ${profileError.message}`)
  }

  return { username, password }
}

export async function resetPassword(userId: string): Promise<{ username: string; password: string }> {
  const client = db()
  const { data: profile } = await client.from('profiles').select('username').eq('id', userId).maybeSingle()
  if (!profile) throw new Error('That account no longer exists.')

  const password = generatePassword()
  const { error } = await client.auth.admin.updateUserById(userId, { password })
  if (error) throw new Error(`Could not reset the password: ${error.message}`)

  const { error: flagError } = await client.from('profiles').update({ must_change_password: true }).eq('id', userId)
  if (flagError) throw new Error(`The password was reset, but could not be marked for change: ${flagError.message}`)

  // A reset is often because someone else knows the old password, so every
  // session on the account ends now, on every device.
  try {
    await revokeSessions(userId)
  } catch (e) {
    throw new Error(`The password was reset to ${password}, but devices already signed in were not signed out: ${(e as Error).message}`)
  }
  return { username: profile.username as string, password }
}

/**
 * Deactivation keeps every attempt and every leaderboard entry intact. The
 * flag alone stops every page and action (lib/guard.ts) and any new login
 * (lib/auth.ts signIn); ending the account's sessions as well signs it out
 * everywhere at once.
 *
 * Sessions are left alone while the student has an attempt running, because
 * PRD 11 lets a student deactivated mid-window finish and score it; the flag
 * still blocks everything else. Reactivating needs nothing more than the flag:
 * the student simply logs in again.
 */
export async function setActive(userId: string, isActive: boolean): Promise<void> {
  const client = db()
  const { error } = await client.from('profiles').update({ is_active: isActive }).eq('id', userId)
  if (error) throw new Error(`Could not update the account: ${error.message}`)
  if (isActive) return

  const { count, error: countError } = await client
    .from('attempts').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('state', 'IN_PROGRESS')
  if (countError) throw new Error(`Deactivated, but could not check for a running test: ${countError.message}`)
  if (count) return
  await revokeSessions(userId)
}
