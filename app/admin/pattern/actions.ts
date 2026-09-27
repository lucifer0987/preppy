'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { savePattern } from '../../../lib/repo/tracks'
import { ALL_SECTION_CODES, SECTION_NAMES, type Pattern, type SectionCode } from '../../../lib/types'
import type { PatternFormState } from './state'

/**
 * Saving one track's pattern.
 *
 * Nothing already stored moves: a paper carries the counts, minutes and marking
 * it was uploaded with, and its length lives on its own row. This only changes
 * what the next upload on this track is given when its file stays silent.
 *
 * The form posts the membership and the order as one ordered `codes` field,
 * and the numbers keyed by code. A section the track dropped simply stops
 * being in `codes`, which is why the pattern is written as a replacement
 * rather than a row-by-row update.
 */
export async function savePatternAction(
  _prev: PatternFormState, formData: FormData,
): Promise<PatternFormState> {
  const admin = await actionAdmin()
  if (!admin) return { error: 'Not authorised.', saved: false }

  const trackId = String(formData.get('trackId') ?? '').trim()
  if (!trackId) return { error: 'No track was named, so nothing was saved.', saved: false }

  const codes = String(formData.get('codes') ?? '')
    .split(',').map((c) => c.trim()).filter(Boolean)
  if (!codes.length) return { error: 'A track needs at least one section.', saved: false }

  const unknown = codes.find((c) => !ALL_SECTION_CODES.includes(c as SectionCode))
  if (unknown) return { error: `${unknown} is not a section this product knows.`, saved: false }

  const num = (name: string) => Number(String(formData.get(name) ?? '').trim())
  const next: Pattern = codes.map((c) => {
    const code = c as SectionCode
    const label = String(formData.get(`${code}.label`) ?? '').trim()
    return {
      code,
      questions: num(`${code}.questions`),
      minutes: num(`${code}.minutes`),
      marksCorrect: num(`${code}.marksCorrect`),
      marksNegative: num(`${code}.marksNegative`),
      // A label matching the built-in name is not a label: storing it would
      // freeze a name the product may improve later.
      ...(label && label !== SECTION_NAMES[code] ? { label } : {}),
    }
  })

  const bad = next.find((s) => [s.questions, s.minutes, s.marksCorrect, s.marksNegative]
    .some((n) => !Number.isFinite(n)))
  if (bad) {
    return { error: `Every box needs a number (check ${SECTION_NAMES[bad.code]}).`, saved: false }
  }

  try {
    await savePattern(trackId, next, admin.id)
  } catch (e) {
    return { error: (e as Error).message, saved: false }
  }

  // Every surface that prints a count, a duration, a section name or the marking.
  for (const path of ['/', '/dashboard', '/admin', '/admin/window', '/admin/papers',
                      '/admin/pattern', '/test/start']) {
    revalidatePath(path)
  }
  return { error: null, saved: true }
}
