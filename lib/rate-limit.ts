/**
 * Rate limits (PRD section 13): login, response writes and paper uploads.
 *
 * The counting happens in the database (rate_limit_* in supabase/schema.sql,
 * called through lib/repo/rate-limit.ts), not in server memory: a serverless
 * host runs many short-lived instances, and each would keep its own count.
 * This module holds the limits themselves and the pure helpers.
 */

export interface Limit {
  /** Tries allowed inside one window. */
  max: number
  windowSec: number
}

export const LIMITS = {
  /** Per account: five wrong passwords, then a 15-minute wait. */
  loginByUsername: { max: 5, windowSec: 15 * 60 },
  /** Per client address: enough for a shared classroom network, not for a script. */
  loginByIp: { max: 20, windowSec: 15 * 60 },
  /**
   * Per attempt. A student answering and moving as fast as they can writes a
   * few times a second at most, in batches; this only stops a runaway loop.
   */
  responses: { max: 600, windowSec: 60 },
  /** Per admin. A paper is uploaded a handful of times while it is corrected. */
  upload: { max: 20, windowSec: 10 * 60 },
} satisfies Record<string, Limit>

/** "Try again in 12 minutes." */
export function retryMessage(waitSec: number): string {
  const minutes = Math.max(1, Math.ceil(waitSec / 60))
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}

/**
 * The client's address from x-forwarded-for (first hop), else x-real-ip.
 * Vercel sets these itself; behind a proxy that passes them through, a client
 * can forge them, which is why the per-username limit is the one relied on.
 */
export function clientIp(forwardedFor: string | null, realIp: string | null): string {
  const first = forwardedFor?.split(',')[0]?.trim()
  return first || realIp?.trim() || 'unknown'
}
