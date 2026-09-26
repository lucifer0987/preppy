'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../lib/guard'
import { finaliseOverdueAttempts } from '../../lib/repo/finalise'

/**
 * The manual run of the nightly job (FR-10.3), for when the 01:00 cron did not
 * fire or failed part-way. Idempotent, so pressing it twice is harmless.
 *
 * A server action rather than a call to the cron route: actions are POST-only
 * and carry Next's origin check, so a cross-site page cannot fire this the way
 * it could a cookie-authenticated GET.
 *
 * Only types are exported besides the action; a "use server" module may export
 * nothing but async functions at runtime.
 */

export interface FinaliseState {
  error: string | null
  /** A one-line summary of the last run, shown under the button. */
  summary: string | null
}

export async function finaliseNowAction(_prev: FinaliseState): Promise<FinaliseState> {
  if (!(await actionAdmin())) return { error: 'Not authorised.', summary: null }

  try {
    const report = await finaliseOverdueAttempts()
    revalidatePath('/admin')
    revalidatePath('/leaderboard')

    const done = report.finalised.length
    const parts = [
      `Checked ${report.scanned} open attempt${report.scanned === 1 ? '' : 's'}`,
      `force-submitted ${done}`,
    ]
    if (report.failed.length) {
      parts.push(`${report.failed.length} failed: ` +
        report.failed.map((f) => `${f.attemptId.slice(0, 8)} (${f.message})`).join('; '))
    }
    const text = parts.join(', ') + '.'
    return report.failed.length ? { error: text, summary: null } : { error: null, summary: text }
  } catch (e) {
    return { error: (e as Error).message, summary: null }
  }
}
