'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { createTrack, renameTrack, setTrackActive } from '../../../lib/repo/tracks'
import type { TrackFormState } from './state'

/** Every screen whose contents depend on which exams exist. */
function refresh() {
  for (const path of ['/', '/admin', '/admin/tracks', '/admin/pattern', '/admin/papers',
                      '/admin/board', '/admin/users', '/dashboard']) {
    revalidatePath(path)
  }
}

export async function createTrackAction(
  _prev: TrackFormState, formData: FormData,
): Promise<TrackFormState> {
  const admin = await actionAdmin()
  if (!admin) return { error: 'Not authorised.', created: null }

  try {
    await createTrack({
      name: String(formData.get('name') ?? ''),
      slug: String(formData.get('slug') ?? '') || undefined,
    }, admin.id)
  } catch (e) {
    return { error: (e as Error).message, created: null }
  }
  refresh()
  return { error: null, created: String(formData.get('name') ?? '').trim() }
}

export async function renameTrackAction(formData: FormData) {
  if (!(await actionAdmin())) return
  await renameTrack(String(formData.get('id')), String(formData.get('name') ?? ''))
  refresh()
}

export async function setTrackActiveAction(formData: FormData) {
  if (!(await actionAdmin())) return
  await setTrackActive(String(formData.get('id')), formData.get('active') === '1')
  refresh()
}
