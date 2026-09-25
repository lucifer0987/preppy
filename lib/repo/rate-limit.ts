import 'server-only'
import { db } from '../supabase/admin'
import type { Limit } from '../rate-limit'

/**
 * The database side of lib/rate-limit.ts. Each returns the seconds to wait,
 * 0 meaning "go ahead".
 *
 * A limiter that cannot reach the database lets the request through: refusing
 * everyone's login, or a student's answers, because the throttle's own read
 * failed would be the worse outcome.
 */

/** How long `key` must wait, without counting this as a try. */
export async function waitFor(key: string, limit: Limit): Promise<number> {
  const { data, error } = await db().rpc('rate_limit_wait', { p_key: key, p_max: limit.max })
  if (error) { console.error('[rate-limit]', error.message); return 0 }
  return (data as number) ?? 0
}

/** Count one try against `key`, returning the wait that now applies. */
export async function hit(key: string, limit: Limit): Promise<number> {
  const { data, error } = await db().rpc('rate_limit_hit', {
    p_key: key, p_max: limit.max, p_window_sec: limit.windowSec,
  })
  if (error) { console.error('[rate-limit]', error.message); return 0 }
  return (data as number) ?? 0
}

export async function clear(key: string): Promise<void> {
  const { error } = await db().rpc('rate_limit_clear', { p_key: key })
  if (error) console.error('[rate-limit]', error.message)
}
