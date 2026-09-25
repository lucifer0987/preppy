import 'server-only'
import { redirect } from 'next/navigation'
import { currentUser, type CurrentUser } from './auth'

/**
 * Access rules, in one place so they cannot drift between routes.
 *
 * FR-6.1.2: an account whose password was set by the admin cannot be used for
 * anything until its owner has chosen their own. Enforcing that per page
 * rather than in the proxy keeps the profile read off every static asset
 * request.
 *
 * A deactivated account is refused everywhere, with one exception (PRD §11):
 * a student deactivated mid-window may finish the attempt already running, so
 * the live test page and its actions pass `allowInactive`.
 *
 * Pages use the `require*` guards, which redirect. Server actions and route
 * handlers use the `action*` guards, which return null so the caller can
 * refuse in its own shape. A layout's guard does not protect the pages or
 * actions under it, so every page and every action checks for itself.
 */

interface GuardOptions {
  allowInactive?: boolean
}

function usable(user: CurrentUser | null, opts: GuardOptions): user is CurrentUser {
  return !!user && (user.isActive || !!opts.allowInactive) && !user.mustChangePassword
}

export async function requireUser(opts: GuardOptions = {}): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user || (!user.isActive && !opts.allowInactive)) redirect('/login')
  if (user.mustChangePassword) redirect('/change-password')
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/dashboard')
  return user
}

/** For the change-password page itself, which must not redirect to itself. */
export async function requireAnySignedIn(): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user || !user.isActive) redirect('/login')
  return user
}

/** A signed-in, active user who has chosen their own password; otherwise null. */
export async function actionUser(opts: GuardOptions = {}): Promise<CurrentUser | null> {
  const user = await currentUser()
  return usable(user, opts) ? user : null
}

/** As actionUser, and an admin. */
export async function actionAdmin(): Promise<CurrentUser | null> {
  const user = await actionUser()
  return user?.role === 'admin' ? user : null
}
