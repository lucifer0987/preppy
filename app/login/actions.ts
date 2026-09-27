'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { normaliseUsername, signIn, signOut } from '../../lib/auth'
import { LIMITS, clientIp, retryMessage } from '../../lib/rate-limit'
import { clear, hit, waitFor } from '../../lib/repo/rate-limit'

export type LoginState = { error: string | null }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')

  // Throttled per account and per address (PRD 13), counting failures only.
  // Checked before Supabase is asked, so a locked-out guesser learns nothing
  // from the answer.
  const h = await headers()
  const userKey = `login:user:${normaliseUsername(username)}`
  const ipKey = `login:ip:${clientIp(h.get('x-forwarded-for'), h.get('x-real-ip'))}`
  const [userWait, ipWait] = await Promise.all([
    waitFor(userKey, LIMITS.loginByUsername), waitFor(ipKey, LIMITS.loginByIp),
  ])
  if (Math.max(userWait, ipWait) > 0) return { error: retryMessage(Math.max(userWait, ipWait)) }

  const result = await signIn(username, password)
  if (!result.ok) {
    await Promise.all([hit(userKey, LIMITS.loginByUsername), hit(ipKey, LIMITS.loginByIp)])
    return { error: result.message }
  }

  await clear(userKey)
  // An admin's home is the console, not the student dashboard. They can still
  // reach the student view from the header; it just is not where they land.
  redirect(result.role === 'admin' ? '/admin' : '/dashboard')
}

export async function logoutAction() {
  await signOut()
  // `?left=1` is read by the landing page, which tells the service worker to
  // forget the past papers it kept. A cache belongs to the browser rather
  // than to the account, and two students share a laptop often enough for
  // that to matter (PRD 6.12).
  redirect('/?left=1')
}
