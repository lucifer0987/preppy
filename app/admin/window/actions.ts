'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { saveWindow } from '../../../lib/repo/settings'
import type { WindowFormState } from './state'

/**
 * Saving the nightly window.
 *
 * Every page that shows a time reads the setting on load, so nothing needs
 * invalidating beyond telling Next the rendered pages are stale.
 */
export async function saveWindowAction(
  _prev: WindowFormState, formData: FormData,
): Promise<WindowFormState> {
  const admin = await actionAdmin()
  if (!admin) return { error: 'Not authorised.', saved: false }

  // The form posts two HH:MM strings, which is what the picker produces; the
  // settings row still stores four integers.
  const at = (name: string) => {
    const [h, m] = String(formData.get(name) ?? '').split(':').map(Number)
    return { h: h ?? NaN, m: m ?? NaN }
  }
  const open = at('openAt')
  const close = at('entryCloseAt')
  const next = {
    openHour: open.h,
    openMinute: open.m,
    entryCloseHour: close.h,
    entryCloseMinute: close.m,
  }

  if (Object.values(next).some((n) => !Number.isFinite(n))) {
    return { error: 'Both times are needed.', saved: false }
  }

  try {
    await saveWindow(next, admin.id)
  } catch (e) {
    return { error: (e as Error).message, saved: false }
  }

  // Every surface that prints a time: the home page, the dashboard, the
  // briefing, the admin console.
  for (const path of ['/', '/dashboard', '/admin', '/test/start', '/admin/papers']) {
    revalidatePath(path)
  }
  return { error: null, saved: true }
}
