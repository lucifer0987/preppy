import 'server-only'
import { cache } from 'react'
import { db } from '../supabase/admin'
import { DEFAULT_WINDOW, windowProblem, type WindowSettings } from '../time'
import {
  DEFAULT_PATTERN, SECTION_CODES, SECTION_NAMES, patternTotals, type Pattern, type SectionCode,
} from '../types'

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

/**
 * The default section pattern: what a paper is given when its file does not say.
 *
 * Cached per request like the window, and falling back the same way -- a read
 * that fails must not take the site down, and the shipped pattern is the one
 * everybody's papers are already written to.
 */
export const getPattern = cache(async (): Promise<Pattern> => {
  const { data, error } = await db()
    .from('default_sections')
    .select('code, position, question_count, duration_sec, marks_correct, marks_negative')
    .order('position')

  if (error || !data?.length) {
    if (error) settingsUnavailable('default_sections', error.message)
    return DEFAULT_PATTERN
  }

  const byCode = new Map(data.map((r) => [r.code as SectionCode, r]))
  // Ordered by SECTION_CODES rather than by what came back: the order sections
  // are sat in is the application's, and a row missing from the table must not
  // silently drop a section from the pattern.
  return SECTION_CODES.map((code) => {
    const r = byCode.get(code)
    const shipped = DEFAULT_PATTERN.find((d) => d.code === code)!
    if (!r) return shipped
    return {
      code,
      questions: r.question_count as number,
      minutes: Math.round((r.duration_sec as number) / 60),
      marksCorrect: Number(r.marks_correct),
      marksNegative: Number(r.marks_negative),
    }
  })
})

/** How long a paper built to the default pattern runs. */
export async function defaultAttemptMinutes(): Promise<number> {
  return patternTotals(await getPattern()).minutes
}

export function patternProblem(pattern: Pattern): string | null {
  if (pattern.length !== SECTION_CODES.length) return 'Every section needs a row.'
  for (const s of pattern) {
    const n = SECTION_NAMES[s.code]
    if (!Number.isInteger(s.questions) || s.questions < 1 || s.questions > 200) {
      return `${n}: the number of questions must be a whole number between 1 and 200.`
    }
    if (!Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 180) {
      return `${n}: the minutes must be a whole number between 1 and 180.`
    }
    if (!(s.marksCorrect > 0) || s.marksCorrect > 10) return `${n}: marks for a correct answer must be above 0 and at most 10.`
    if (s.marksNegative < 0 || s.marksNegative > 10) return `${n}: the penalty must be between 0 and 10.`
    // The columns are numeric(4,2): more precision than that is silently lost,
    // and every score afterwards uses the rounded figure.
    for (const [v, what] of [[s.marksCorrect, 'Marks for a correct answer'],
                             [s.marksNegative, 'The penalty']] as const) {
      if (Math.abs(v * 100 - Math.round(v * 100)) >= 1e-9) {
        return `${n}: ${what.toLowerCase()} is kept to two decimal places, so ${v} cannot be stored exactly.`
      }
    }
  }
  const { minutes } = patternTotals(pattern)
  if (minutes > 8 * 60) return `The sections add up to ${minutes} minutes, longer than the ${8 * 60} a paper may run.`
  return null
}

export async function savePattern(next: Pattern, adminId: string): Promise<void> {
  const problem = patternProblem(next)
  if (problem) throw new Error(problem)

  // Checked before anything is written, not after. The window's "fits inside
  // the day" rule depends on this total, so a longer pattern can leave the
  // saved window impossible -- and a save that reports an error after
  // succeeding is the worst of both.
  const clash = windowProblem(await getWindow(), patternTotals(next).minutes)
  if (clash) {
    throw new Error(
      `A paper on this pattern runs ${patternTotals(next).minutes} minutes, which the default `
      + `window cannot fit. Change the window first, then come back. ${clash}`,
    )
  }

  // One row per section, so this is four updates rather than one. `position` is
  // deliberately not among them: the order sections are sat in is fixed, and
  // writing a unique column in a loop only creates a way to collide with the
  // row that holds the value next.
  const stamp = { updated_at: new Date().toISOString(), updated_by: adminId }
  for (const s of next) {
    const { error } = await db().from('default_sections').update({
      question_count: s.questions,
      duration_sec: s.minutes * 60,
      marks_correct: s.marksCorrect,
      marks_negative: s.marksNegative,
      ...stamp,
    }).eq('code', s.code)
    if (error) throw new Error(`Could not save the ${s.code} defaults: ${error.message}`)
  }
}

/** Who last changed the pattern, and when: the most recent of the four rows. */
export async function getPatternMeta(): Promise<{ updatedAt: string | null; updatedBy: string | null }> {
  const { data } = await db()
    .from('default_sections')
    .select('updated_at, profiles:updated_by(display_name)')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { updatedAt: null, updatedBy: null }
  const p = data.profiles as unknown as { display_name: string } | null
  return { updatedAt: (data.updated_at as string | null) ?? null, updatedBy: p?.display_name ?? null }
}

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
  const { data } = await db()
    .from('app_settings')
    .select('updated_at, profiles:updated_by(display_name)')
    .maybeSingle()
  if (!data) return { updatedAt: null, updatedBy: null }
  const p = data.profiles as unknown as { display_name: string } | null
  return { updatedAt: (data.updated_at as string | null) ?? null, updatedBy: p?.display_name ?? null }
}
