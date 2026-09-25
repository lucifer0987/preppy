import 'server-only'
import { db } from './supabase/admin'
import { isConfigured } from './env'
import { authClient } from './supabase/session'

/**
 * Authentication (PRD section 6.1).
 *
 * Login is username + password only. Supabase Auth needs an email, so a
 * username maps to a synthetic internal address that is never shown to the
 * user, never collected, and never sent mail — no SMTP is configured on the
 * project. Password hashing and sessions are Supabase's responsibility; no
 * custom crypto is written anywhere in this codebase.
 */

export const USERNAME_DOMAIN = 'preppy.local'
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export type Role = 'student' | 'admin'

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
}

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function usernameToEmail(username: string): string {
  return `${normaliseUsername(username)}@${USERNAME_DOMAIN}`
}

export function emailToUsername(email: string): string {
  return email.replace(new RegExp(`@${USERNAME_DOMAIN}$`), '')
}

/** The signed-in user's profile, or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  // Before setup there is nothing to authenticate against. Returning null
  // sends the visitor to /login, which explains what is missing, rather than
  // throwing a 500 out of a layout.
  if (!isConfigured()) return null

  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await db()
    .from('profiles')
    .select('id, username, display_name, role, is_active, must_change_password')
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
  }
}

export type SignInResult = { ok: true } | { ok: false; message: string }

/**
 * Failures are deliberately indistinguishable, so the form never reveals
 * whether a username exists. A deactivated account is the one exception,
 * because the user needs to know to contact the admin.
 */
export async function signIn(usernameInput: string, password: string): Promise<SignInResult> {
  const username = normaliseUsername(usernameInput)
  const generic = { ok: false as const, message: 'Wrong username or password.' }
  if (!isConfigured()) {
    return { ok: false, message: 'Preppy is not configured yet. See SETUP.md.' }
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
    .select('is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile) { await supabase.auth.signOut(); return generic }
  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { ok: false, message: 'This account is inactive. Contact your admin.' }
  }

  await db().from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id)
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = await authClient()
  await supabase.auth.signOut()
}
