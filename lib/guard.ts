import 'server-only'
import { redirect } from 'next/navigation'
import { currentUser, type CurrentUser } from './auth'

/**
 * Page guards, in one place so the rules cannot drift between routes.
 *
 * FR-6.1.2: an account whose password was set by the admin cannot be used for
 * anything until its owner has chosen their own. Enforcing that per page
 * rather than in the proxy keeps the profile read off every static asset
 * request, and there is only one way into the app anyway.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user) redirect('/login')
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
  if (!user) redirect('/login')
  return user
}
