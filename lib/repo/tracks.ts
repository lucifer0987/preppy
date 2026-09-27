import 'server-only'
import { cache } from 'react'
import { db } from '../supabase/admin'
import { isConfigured } from '../env'
import {
  ALL_SECTION_CODES, DEFAULT_PATTERN, SECTION_NAMES, patternTotals,
  type Pattern, type SectionCode,
} from '../types'

/**
 * Tracks (PRD section 6.10).
 *
 * A track is an exam somebody is preparing for. It owns an ordered pattern of
 * sections and a set of papers; a student follows exactly one, and sees only
 * its papers and only its board.
 *
 * Everything the product had before is the first track. That is the property
 * worth protecting: with one track nothing on screen mentions one, because a
 * choice between one thing is not a choice.
 */

export interface Track {
  id: string
  slug: string
  name: string
  position: number
  isActive: boolean
}

const rowToTrack = (r: Record<string, unknown>): Track => ({
  id: r['id'] as string,
  slug: r['slug'] as string,
  name: r['name'] as string,
  position: r['position'] as number,
  isActive: (r['is_active'] as boolean | null) ?? true,
})

/**
 * Every track, in the order the console lists them.
 *
 * Cached per request: a console page asks "how many are there" to decide
 * whether to render a switcher at all, and then asks again for the switcher.
 */
export const listTracks = cache(async (): Promise<Track[]> => {
  if (!isConfigured()) return []
  const { data, error } = await db()
    .from('tracks').select('id, slug, name, position, is_active').order('position')
  if (error) {
    // A missing table means the migration has not been applied. Say what to do
    // rather than repeating PostgREST's schema-cache wording.
    if (/schema cache|does not exist/i.test(error.message)) {
      console.error(
        '[tracks] The "tracks" table is not in your database yet.\n' +
        '         Apply the pending migration:  npm run migrate',
      )
    } else {
      console.error(`[tracks] Could not list tracks: ${error.message}`)
    }
    return []
  }
  return (data ?? []).map(rowToTrack)
})

export const getTrack = cache(async (id: string): Promise<Track | null> => {
  const all = await listTracks()
  return all.find((t) => t.id === id) ?? null
})

export const trackBySlug = cache(async (slug: string): Promise<Track | null> => {
  const all = await listTracks()
  return all.find((t) => t.slug === slug) ?? null
})

/**
 * The track to show somebody who has not chosen one: the first active one.
 *
 * Used by the landing page, which has no viewer to ask, and by the console,
 * where an admin runs every track and has to start somewhere.
 */
export const defaultTrack = cache(async (): Promise<Track | null> => {
  const all = await listTracks()
  return all.find((t) => t.isActive) ?? all[0] ?? null
})

/**
 * Resolve the track a console screen is looking at.
 *
 * `?track=<slug>` when the admin has picked one, the first active track when
 * they have not. An unknown slug falls back rather than erroring: a stale
 * bookmark should show the console, not a failure.
 */
export async function consoleTrack(slug?: string): Promise<Track | null> {
  if (slug) {
    const chosen = await trackBySlug(slug)
    if (chosen) return chosen
  }
  return defaultTrack()
}

/**
 * The track a signed-in person's own pages are about.
 *
 * A student follows one, and it is theirs. An admin follows none -- they run
 * every track -- so when one looks at a student screen they are shown the
 * first active track, the same one the signed-out landing page describes.
 *
 * The same fallback covers a student whose track is somehow unset, which the
 * console will not create but a hand-edited row could. Showing them the first
 * track is better than showing them an empty product and no reason for it.
 */
export async function viewerTrack(
  user: { trackId: string | null },
): Promise<Track | null> {
  if (user.trackId) {
    const mine = await getTrack(user.trackId)
    if (mine) return mine
  }
  return defaultTrack()
}

/**
 * One track's pattern: what a paper on it is given when its file does not say.
 *
 * Falls back to the shipped pattern the way the window does -- a read that
 * fails must not take the site down, and before setup there is no database to
 * ask.
 */
export const getPattern = cache(async (trackId?: string): Promise<Pattern> => {
  if (!isConfigured()) return DEFAULT_PATTERN
  const id = trackId ?? (await defaultTrack())?.id
  if (!id) return DEFAULT_PATTERN

  const { data, error } = await db()
    .from('track_sections')
    .select('code, position, label, question_count, duration_sec, marks_correct, marks_negative')
    .eq('track_id', id)
    .order('position')

  if (error || !data?.length) {
    // A read that failed falls back, as the window does: the site must not go
    // down over it. A track that genuinely has no sections is a different
    // thing and should be impossible -- createTrack seeds one and
    // save_track_pattern refuses to leave one empty -- so it is said out loud
    // rather than quietly papered over with a pattern nobody chose.
    if (error) console.error(`[tracks] Could not read the pattern: ${error.message}`)
    else {
      console.error(
        `[tracks] Track ${id} has no sections, so the shipped pattern is standing in for it.\n` +
        '         Set its pattern on the admin console (Pattern), because papers are ' +
        'being checked against a shape nobody chose.',
      )
    }
    return DEFAULT_PATTERN
  }

  // Ordered by `position`, which is the order the sections are sat in. That
  // order is the track's, not the application's: it used to be a constant, and
  // that is what made every paper the same exam.
  return data.map((r) => ({
    code: r.code as SectionCode,
    questions: r.question_count as number,
    minutes: Math.round((r.duration_sec as number) / 60),
    marksCorrect: Number(r.marks_correct),
    marksNegative: Number(r.marks_negative),
    ...(r.label ? { label: r.label as string } : {}),
  }))
})

/**
 * May this person be shown this paper at all?
 *
 * An admin runs every track, so always. A student follows one, and a paper on
 * another exam does not exist for them: not to sit, not to read, not to
 * practise, not even to load an image from.
 *
 * Every route that addresses a paper by an id out of the URL has to ask this,
 * and that is the whole point of it being a function rather than a line
 * repeated four times. A paper the student was never shown is still one URL
 * away, and the lists are not a security boundary -- they only decide what is
 * easy to find.
 */
export async function paperOnViewersTrack(
  user: { role: string; trackId: string | null },
  paperTrackId: string | null,
): Promise<boolean> {
  if (user.role === 'admin') return true
  if (!paperTrackId) return false
  const mine = await viewerTrack(user)
  return Boolean(mine && mine.id === paperTrackId)
}

/**
 * The pattern behind one paper, for any screen that has a paper in hand and
 * needs to print a section name.
 *
 * Resolved from the track rather than stored on the paper, so correcting a
 * section's name corrects it everywhere it has ever appeared. A label is a
 * name, not a record of what the name was on the night.
 *
 * Cached per request, and `getPattern` is cached per track underneath, so a
 * page printing four section names makes one query, not four.
 */
export const patternForPaper = cache(async (testId: string): Promise<Pattern> => {
  if (!isConfigured()) return DEFAULT_PATTERN
  const { data } = await db().from('tests').select('track_id').eq('id', testId).maybeSingle()
  return getPattern((data?.['track_id'] as string | null) ?? undefined)
})

/** How long a paper built to this track's pattern runs. */
export async function defaultAttemptMinutes(trackId?: string): Promise<number> {
  return patternTotals(await getPattern(trackId)).minutes
}

/**
 * Whether a pattern is one a paper could be built to.
 *
 * The length check used to be "exactly four". A track decides how many
 * sections it has, so what is left is that there is at least one, that no
 * section appears twice, and that every number is one the columns can hold.
 */
export function patternProblem(pattern: Pattern): string | null {
  if (!pattern.length) return 'A track needs at least one section.'
  const seen = new Set<SectionCode>()
  for (const s of pattern) {
    if (!ALL_SECTION_CODES.includes(s.code)) return `${s.code} is not a section this product knows.`
    if (seen.has(s.code)) return `${SECTION_NAMES[s.code]} appears twice. A section can only be sat once.`
    seen.add(s.code)

    const n = s.label?.trim() || SECTION_NAMES[s.code]
    if (!Number.isInteger(s.questions) || s.questions < 1 || s.questions > 200) {
      return `${n}: the number of questions must be a whole number between 1 and 200.`
    }
    if (!Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 180) {
      return `${n}: the minutes must be a whole number between 1 and 180.`
    }
    if (!(s.marksCorrect > 0) || s.marksCorrect > 10) return `${n}: marks for a correct answer must be above 0 and at most 10.`
    if (s.marksNegative < 0 || s.marksNegative > 10) return `${n}: the penalty must be between 0 and 10.`
    if (s.label !== undefined && s.label.trim().length > 60) {
      return `${n}: a section name is kept to 60 characters.`
    }
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

/**
 * Replace one track's pattern.
 *
 * A replacement rather than a row-by-row update, because the set of sections
 * itself can change: a track that drops General Awareness has a row to remove,
 * not a row to edit.
 *
 * One transaction in the database (save_track_pattern in supabase/migrations),
 * and that matters more here than it looks. This was a DELETE followed by an
 * INSERT as two PostgREST calls, so a failure between them left the track with
 * no sections -- and getPattern reads a track with no sections as the shipped
 * default. A half-written save did not raise anything; it quietly turned the
 * track into a different exam.
 */
export async function savePattern(trackId: string, next: Pattern, adminId: string): Promise<void> {
  const problem = patternProblem(next)
  if (problem) throw new Error(problem)

  const { error } = await db().rpc('save_track_pattern', {
    p: {
      track_id: trackId,
      updated_by: adminId,
      sections: next.map((s) => ({
        code: s.code,
        label: s.label?.trim() || null,
        question_count: s.questions,
        duration_sec: s.minutes * 60,
        marks_correct: s.marksCorrect,
        marks_negative: s.marksNegative,
      })),
    },
  })
  if (!error) return
  if (/NO_SUCH_TRACK/.test(error.message)) throw new Error('That exam no longer exists.')
  if (/EMPTY_PATTERN/.test(error.message)) throw new Error('A track needs at least one section.')
  if (/NO_TRACK/.test(error.message)) throw new Error('No exam was named, so nothing was saved.')
  throw new Error(`Could not save the pattern, so nothing was changed: ${error.message}`)
}

export async function getPatternMeta(
  trackId: string,
): Promise<{ updatedAt: string | null; updatedBy: string | null }> {
  if (!isConfigured()) return { updatedAt: null, updatedBy: null }
  const { data } = await db()
    .from('track_sections')
    .select('updated_at, profiles:updated_by(display_name)')
    .eq('track_id', trackId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { updatedAt: null, updatedBy: null }
  const p = data.profiles as unknown as { display_name: string } | null
  return { updatedAt: (data.updated_at as string | null) ?? null, updatedBy: p?.display_name ?? null }
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/

/** A name turned into the slug a URL can carry, for the create form's default. */
export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40)
}

/**
 * A new track, with a pattern to start from.
 *
 * It is seeded with the shipped pattern rather than left empty: a track with
 * no sections cannot hold a paper, so an empty one would be a track that does
 * not work yet and does not say so. The Pattern screen is where it becomes
 * the exam it is actually for.
 */
export async function createTrack(
  input: { name: string; slug?: string }, adminId: string,
): Promise<string> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 60) throw new Error('A track name is 1 to 60 characters.')
  const slug = (input.slug?.trim() || slugify(name))
  if (!SLUG.test(slug)) {
    throw new Error(
      `"${slug}" cannot be a track address. Use lower-case letters, digits and hyphens, 2 to 40 characters.`,
    )
  }

  const existing = await listTracks()
  if (existing.some((t) => t.slug === slug)) throw new Error(`There is already a track at "${slug}".`)
  const position = existing.reduce((n, t) => Math.max(n, t.position), 0) + 1

  const { data, error } = await db()
    .from('tracks').insert({ name, slug, position }).select('id').single()
  if (error) throw new Error(`Could not create the track: ${error.message}`)
  const id = data!.id as string

  await savePattern(id, DEFAULT_PATTERN, adminId)
  return id
}

export async function renameTrack(id: string, nameInput: string): Promise<string> {
  const name = nameInput.trim()
  if (name.length < 1 || name.length > 60) throw new Error('A track name is 1 to 60 characters.')
  const { error } = await db().from('tracks').update({ name }).eq('id', id)
  if (error) throw new Error(`Could not rename the track: ${error.message}`)
  return name
}

/**
 * Stop scheduling papers on a track, keeping everything already on it.
 *
 * The same shape as deactivating an account: the login stops, the history
 * stays. A student still following a deactivated track keeps their board and
 * their archive, and no new paper appears.
 */
export async function setTrackActive(id: string, active: boolean): Promise<void> {
  if (!active) {
    const all = await listTracks()
    if (!all.some((t) => t.isActive && t.id !== id)) {
      throw new Error('This is the only active track. Add another before closing this one.')
    }
  }
  const { error } = await db().from('tracks').update({ is_active: active }).eq('id', id)
  if (error) throw new Error(`Could not change the track: ${error.message}`)
}

/** How many students follow each track, for the console's list. */
export async function trackStudentCounts(): Promise<Map<string, number>> {
  const { data, error } = await db()
    .from('profiles').select('track_id').eq('role', 'student').eq('is_active', true)
  if (error) throw new Error(`Could not count students: ${error.message}`)
  const counts = new Map<string, number>()
  for (const r of data ?? []) {
    const id = r.track_id as string | null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** How many papers each track has scheduled, for the console's list. */
export async function trackPaperCounts(): Promise<Map<string, number>> {
  const { data, error } = await db()
    .from('tests').select('track_id').eq('status', 'SCHEDULED')
  if (error) throw new Error(`Could not count papers: ${error.message}`)
  const counts = new Map<string, number>()
  for (const r of data ?? []) {
    const id = r.track_id as string | null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}
