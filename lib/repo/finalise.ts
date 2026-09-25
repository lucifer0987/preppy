import 'server-only'
import { db } from '../supabase/admin'
import { submitAttempt } from './attempts'
import { hardStopAt, istDate } from '../time'

/**
 * The nightly job (FR-10.2). It does one thing: score any attempt still open
 * past its paper's hard stop.
 *
 * Everything else the PRD once wanted a job for is derived on read instead —
 * unlocking at 22:00, closing entry at 23:15, opening the archive at midnight,
 * the leaderboard itself. Those cannot fail because nothing has to run.
 *
 * Idempotent (FR-10.3): submitAttempt returns early for anything already
 * finished, so re-running after a failure produces the same result.
 */

export interface FinaliseReport {
  scanned: number
  finalised: string[]
  failed: { attemptId: string; message: string }[]
}

export async function finaliseOverdueAttempts(now = new Date()): Promise<FinaliseReport> {
  const client = db()
  const today = istDate(now)

  // Anything still open on a paper dated today or earlier is a candidate; the
  // hard stop below decides. Future papers cannot have attempts yet.
  const { data: attempts, error } = await client
    .from('attempts')
    .select('id, tests(date)')
    .eq('state', 'IN_PROGRESS')
    .lte('tests.date', today)

  if (error) throw new Error(`Could not list open attempts: ${error.message}`)

  const report: FinaliseReport = { scanned: (attempts ?? []).length, finalised: [], failed: [] }

  for (const a of attempts ?? []) {
    const date = (a.tests as unknown as { date: string } | null)?.date
    if (!date) continue
    if (now.getTime() < hardStopAt(date).getTime()) continue // still legitimately running

    try {
      await submitAttempt(a.id as string, 'AUTO_SUBMITTED')
      report.finalised.push(a.id as string)
    } catch (e) {
      report.failed.push({ attemptId: a.id as string, message: (e as Error).message })
    }
  }

  return report
}
