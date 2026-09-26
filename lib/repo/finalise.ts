import 'server-only'
import { db } from '../supabase/admin'
import { submitAttempt } from './attempts'
import { attemptHardStop } from '../attempt'

/**
 * The nightly job (FR-10.2). It does one thing: score any attempt still open
 * past its hard stop — the paper's for a counted attempt, its own 45 minutes
 * for a dry run, which may be of any paper on any day.
 *
 * Everything else the PRD once wanted a job for is derived on read instead —
 * each paper's own opening and entry close, the archive, the leaderboard
 * itself. Those cannot fail because nothing has to run.
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
  return finaliseOverdue(now, null)
}

/**
 * The same sweep, for one student, run when they try to start a paper.
 *
 * Once a day can hold more than one paper, the nightly job is too late to be
 * the only backstop: a student who abandons the morning paper still holds the
 * single live attempt `attempts_one_live_per_user` allows, so the evening
 * paper refuses to start and nothing clears it until 03:00 the next morning.
 * Scoring their own overdue attempts first costs one query and unblocks them.
 */
export async function finaliseOverdueForUser(userId: string, now = new Date()): Promise<FinaliseReport> {
  return finaliseOverdue(now, userId)
}

async function finaliseOverdue(now: Date, userId: string | null): Promise<FinaliseReport> {
  const client = db()

  // Every open attempt is a candidate; its hard stop decides. There are only
  // ever a handful, and a date filter would miss dry runs of future papers.
  let query = client
    .from('attempts')
    .select('id, is_dry_run, started_at, tests!inner(date, opens_at_min, entry_closes_at_min, sections(duration_sec))')
    .eq('state', 'IN_PROGRESS')
  if (userId) query = query.eq('user_id', userId)
  const { data: attempts, error } = await query

  if (error) throw new Error(`Could not list open attempts: ${error.message}`)

  const report: FinaliseReport = { scanned: (attempts ?? []).length, finalised: [], failed: [] }

  for (const a of attempts ?? []) {
    const test = a.tests as unknown as { date: string; opens_at_min: number; entry_closes_at_min: number; sections: { duration_sec: number }[] } | null
    if (!test) continue
    const hardStop = attemptHardStop({
      isDryRun: a.is_dry_run as boolean,
      window: {
        date: test.date,
        opensAtMin: test.opens_at_min,
        entryClosesAtMin: test.entry_closes_at_min,
      },
      startedAt: new Date(a.started_at as string),
      sections: test.sections.map((s) => ({ durationSec: s.duration_sec })),
    })
    if (now.getTime() < hardStop.getTime()) continue // still legitimately running

    try {
      await submitAttempt(a.id as string, 'AUTO_SUBMITTED')
      report.finalised.push(a.id as string)
    } catch (e) {
      report.failed.push({ attemptId: a.id as string, message: (e as Error).message })
    }
  }

  return report
}
