import 'server-only'
import { cache } from 'react'
import { db } from '../supabase/admin'
import { DEFAULT_WINDOW, windowProblem, type WindowSettings } from '../time'

/**
 * The one settings row.
 *
 * Wrapped in React's `cache` so a page that needs the window in six places
 * reads it once per request. It is not cached beyond that: a change made in
 * the admin console must take effect on the next page load, not whenever some
 * timer expires.
 */
export const getWindow = cache(async (): Promise<WindowSettings> => {
  const { data, error } = await db()
    .from('app_settings')
    .select('open_hour, open_minute, entry_close_hour, entry_close_minute')
    .maybeSingle()

  // A settings read that fails must not take the site down: falling back to
  // the documented default keeps papers opening at the time everyone expects.
  if (error || !data) {
    if (error) console.error('[settings]', error.message)
    return DEFAULT_WINDOW
  }

  return {
    openHour: data.open_hour as number,
    openMinute: data.open_minute as number,
    entryCloseHour: data.entry_close_hour as number,
    entryCloseMinute: data.entry_close_minute as number,
  }
})

export async function saveWindow(next: WindowSettings, adminId: string): Promise<void> {
  // Checked here as well as by the database, so the admin gets the sentence
  // rather than a constraint name.
  const problem = windowProblem(next)
  if (problem) throw new Error(problem)

  const { error } = await db().from('app_settings').update({
    open_hour: next.openHour,
    open_minute: next.openMinute,
    entry_close_hour: next.entryCloseHour,
    entry_close_minute: next.entryCloseMinute,
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  }).eq('id', true)

  if (error) throw new Error(`Could not save the window: ${error.message}`)
}

export async function getWindowMeta(): Promise<{ updatedAt: string | null; updatedBy: string | null }> {
  const { data } = await db()
    .from('app_settings')
    .select('updated_at, profiles:updated_by(display_name)')
    .maybeSingle()
  if (!data) return { updatedAt: null, updatedBy: null }
  const p = data.profiles as unknown as { display_name: string } | null
  return { updatedAt: (data.updated_at as string | null) ?? null, updatedBy: p?.display_name ?? null }
}
