import 'server-only'
import { cache } from 'react'
import { db } from './supabase/admin'
import { isConfigured } from './env'
import { authClient } from './supabase/session'
import { sessionIdFromToken } from './password'
import { USERNAME_PATTERN, normaliseUsername, usernameToEmail } from './username'

/**
 * Authentication (PRD section 6.1).
 *
 * Login is username + password only. Supabase Auth needs an email, so a
 * username maps to a synthetic internal address that is never shown to the
 * user, never collected, and never sent mail — no SMTP is configured on the
 * project. Password hashing and sessions are Supabase's responsibility; no
 * custom crypto is written anywhere in this codebase.
 */

export { USERNAME_PATTERN, normaliseUsername, usernameToEmail } from './username'

export type Role = 'student' | 'admin'

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  /** Remembered per person, not per browser (PRD 8.3). */
  soundEnabled: boolean
  /**
   * The exam this student is preparing for, and the whole of what they see:
   * their papers, their archive, their board. Null for an admin, who runs
   * every track rather than following one.
   */
  trackId: string | null
}

/**
 * The signed-in user's profile, or null. Deactivated users are returned with
 * isActive false; lib/guard.ts decides what they may still do.
 *
 * getUser() asks the auth server, which refuses a token whose session has been
 * revoked (see revokeSessions), so a reset or a test started elsewhere signs
 * this device out on its next request.
 *
 * Cached per request, so a layout and its page share one lookup.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  // Before setup there is nothing to authenticate against. Returning null
  // sends the visitor to /login, which explains what is missing, rather than
  // throwing a 500 out of a layout.
  if (!isConfigured()) return null

  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await db()
    .from('profiles')
    .select('id, username, display_name, role, is_active, must_change_password, sound_enabled, track_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data) return null
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: data.role,
    isActive: data.is_active,
    mustChangePassword: data.must_change_password,
    soundEnabled: data.sound_enabled ?? false,
    trackId: (data.track_id as string | null) ?? null,
  }
})

/**
 * Ends a user's sessions on every device, except `keep` when given.
 * Best effort by design at the call sites: a failure is reported, and the
 * account stays usable.
 */
export async function revokeSessions(userId: string, keep: string | null = null): Promise<void> {
  const { error } = await db().rpc('revoke_user_sessions', { p_user: userId, p_keep: keep })
  if (!error) return
  // Keeping this request's own session means the caller is the user, so
  // Supabase's own sign-out of their other sessions is available. It revokes
  // their refresh tokens, so they end within an access token's lifetime
  // rather than at once: a fallback, not an equal.
  if (keep) {
    const supabase = await authClient()
    const { error: fallbackError } = await supabase.auth.signOut({ scope: 'others' })
    if (!fallbackError) {
      console.error(`[auth] revoke_user_sessions failed (${error.message}); used sign-out of other sessions instead`)
      return
    }
  }
  throw new Error(`Could not sign out the other sessions: ${error.message}`)
}

/** The id of the session this request is signed in with, or null. */
export async function currentSessionId(): Promise<string | null> {
  const supabase = await authClient()
  const { data: { session } } = await supabase.auth.getSession()
  return sessionIdFromToken(session?.access_token)
}

export type SignInResult =
  | { ok: true; sessionId: string | null; role: string }
  | { ok: false; message: string }

/**
 * Failures are deliberately indistinguishable, so the form never reveals
 * whether a username exists. A deactivated account is the one exception,
 * because the user needs to know to contact the admin.
 */
export async function signIn(usernameInput: string, password: string): Promise<SignInResult> {
  const username = normaliseUsername(usernameInput)
  const generic = { ok: false as const, message: 'Wrong username or password.' }
  if (!isConfigured()) {
    return { ok: false, message: 'Preppy is not configured yet. See docs/setup.html.' }
  }

  if (!USERNAME_PATTERN.test(username) || password.length === 0) return generic

  const supabase = await authClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })
  if (error || !data.user) return generic

  const { data: profile } = await db()
    .from('profiles')
    .select('is_active, role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile) { await supabase.auth.signOut(); return generic }
  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { ok: false, message: 'This account is inactive. Contact your admin.' }
  }

  await db().from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id)
  // The caller needs the role to know where to send them: an admin landing on
  // the student dashboard has to notice the mistake and navigate out of it.
  return {
    ok: true,
    sessionId: sessionIdFromToken(data.session?.access_token),
    role: String(profile.role ?? 'student'),
  }
}

export async function signOut(): Promise<void> {
  const supabase = await authClient()
  await supabase.auth.signOut()
}
