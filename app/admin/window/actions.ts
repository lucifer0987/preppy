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

  const num = (name: string) => Number(String(formData.get(name) ?? '').trim())
  const next = {
    openHour: num('openHour'),
    openMinute: num('openMinute'),
    entryCloseHour: num('entryCloseHour'),
    entryCloseMinute: num('entryCloseMinute'),
  }

  if (Object.values(next).some((n) => !Number.isFinite(n))) {
    return { error: 'Every box needs a number.', saved: false }
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
