'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { savePattern } from '../../../lib/repo/settings'
import { SECTION_CODES, type Pattern } from '../../../lib/types'
import type { PatternFormState } from './state'

/**
 * Saving the default paper pattern.
 *
 * Nothing already stored moves: a paper carries the counts, minutes and marking
 * it was uploaded with, and its length lives on its own row. This only changes
 * what the next upload is given when its file stays silent.
 */
export async function savePatternAction(
  _prev: PatternFormState, formData: FormData,
): Promise<PatternFormState> {
  const admin = await actionAdmin()
  if (!admin) return { error: 'Not authorised.', saved: false }

  const num = (name: string) => Number(String(formData.get(name) ?? '').trim())
  const next: Pattern = SECTION_CODES.map((code) => ({
    code,
    questions: num(`${code}.questions`),
    minutes: num(`${code}.minutes`),
    marksCorrect: num(`${code}.marksCorrect`),
    marksNegative: num(`${code}.marksNegative`),
  }))

  const bad = next.find((s) => [s.questions, s.minutes, s.marksCorrect, s.marksNegative]
    .some((n) => !Number.isFinite(n)))
  if (bad) return { error: `Every box needs a number (check ${bad.code}).`, saved: false }

  try {
    await savePattern(next, admin.id)
  } catch (e) {
    return { error: (e as Error).message, saved: false }
  }

  // Every surface that prints a count, a duration or the marking.
  for (const path of ['/', '/dashboard', '/admin', '/admin/window', '/admin/papers', '/test/start']) {
    revalidatePath(path)
  }
  return { error: null, saved: true }
}
