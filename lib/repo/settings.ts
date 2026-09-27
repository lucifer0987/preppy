import 'server-only'
import { cache } from 'react'
import { db } from '../supabase/admin'
import { isConfigured } from '../env'
import { DEFAULT_WINDOW, windowProblem, type WindowSettings } from '../time'
import { defaultAttemptMinutes } from './tracks'

/**
 * The one settings row.
 *
 * Wrapped in React's `cache` so a page that needs the window in six places
 * reads it once per request. It is not cached beyond that: a change made in
 * the admin console must take effect on the next page load, not whenever some
 * timer expires.
 */
/**
 * A settings read that failed.
 *
 * The app carries on with the shipped defaults rather than going down, which is
 * right -- but the reason is almost always one thing, and "Could not find the
 * table in the schema cache" does not say what to do about it. So this names
 * the fix instead of repeating the symptom.
 */
function settingsUnavailable(table: string, message: string): void {
  const missing = /schema cache|does not exist|relation .* does not exist/i.test(message)
  if (missing) {
    console.error(
      `[settings] The "${table}" table is not in your database yet, so the app is using the ` +
      'shipped defaults.\n' +
      '           Apply the pending migration:  npm run migrate\n' +
      '           (npm run migrate -- --status shows what is outstanding.)',
    )
    return
  }
  console.error(`[settings] Could not read ${table}: ${message}`)
}

export const getWindow = cache(async (): Promise<WindowSettings> => {
  // Before setup there is no database to ask, and db() throws for the missing
  // key. The shipped default is the honest answer, and it is what the splash
  // page needs in order to say when a paper would normally open. Without this
  // the front page 500s on a fresh clone, which is the first thing anyone sees.
  if (!isConfigured()) return DEFAULT_WINDOW

  const { data, error } = await db()
    .from('app_settings')
    .select('open_hour, open_minute, entry_close_hour, entry_close_minute')
    .maybeSingle()

  // A settings read that fails must not take the site down: falling back to
  // the documented default keeps papers opening at the time everyone expects.
  if (error || !data) {
    if (error) settingsUnavailable('app_settings', error.message)
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
  // rather than a constraint name. The rule depends on how long a paper built
  // to the current default pattern runs, so that total comes along.
  const problem = windowProblem(next, await defaultAttemptMinutes())
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
  if (!isConfigured()) return { updatedAt: null, updatedBy: null }
  const { data } = await db()
    .from('app_settings')
    .select('updated_at, profiles:updated_by(display_name)')
    .maybeSingle()
  if (!data) return { updatedAt: null, updatedBy: null }
  const p = data.profiles as unknown as { display_name: string } | null
  return { updatedAt: (data.updated_at as string | null) ?? null, updatedBy: p?.display_name ?? null }
}
