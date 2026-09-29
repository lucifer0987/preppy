import 'server-only'
import { db } from '../supabase/admin'
import { istDate, type PaperWindow } from '../time'
import { PAPER_WINDOW_COLUMNS, paperWindowOf } from './papers'

/**
 * What the admin sees about attempts (PRD 6.9.4).
 *
 * Score, duration, submission type and the two integrity counters. There is
 * no event log to show, because there is no event log: FR-6.5.4 reduced
 * integrity recording to two integers on the attempt row, which is why there
 * is also no retention policy anywhere in this codebase.
 */

export interface AdminAttemptRow {
  id: string
  userId: string
  username: string
  displayName: string
  state: string
  isDryRun: boolean
  totalScore: number | null
  attempted: number | null
  correct: number | null
  notReached: number | null
  timeSpentSec: number | null
  fullscreenExits: number
  tabSwitches: number
  submittedAt: string | null
}

export interface AdminTestAttempts {
  testId: string
  date: string
  title: string | null
  /**
   * Needed to say whether clearing an attempt would actually let the student
   * sit the paper again. Without it the console can only offer the action and
   * hope.
   */
  window: PaperWindow
  attempts: AdminAttemptRow[]
}

/** A finished attempt that counts: the only kind that may be voided. */
export const FINISHED_STATES = ['SUBMITTED', 'AUTO_SUBMITTED'] as const

/** How many students are sitting this paper at this moment. */
export async function countRunningAttempts(testId: string): Promise<number> {
  const { count, error } = await db()
    .from('attempts').select('id', { count: 'exact', head: true })
    .eq('test_id', testId).eq('is_dry_run', false).eq('state', 'IN_PROGRESS')
  if (error) throw new Error(`Could not count who is sitting it: ${error.message}`)
  return count ?? 0
}

export function isCounted(a: Pick<AdminAttemptRow, 'state' | 'isDryRun'>): boolean {
  return !a.isDryRun && (FINISHED_STATES as readonly string[]).includes(a.state)
}

/**
 * Attempts grouped by paper, newest paper first.
 *
 * By default the 30 most recent papers that could have been sat, so papers
 * scheduled ahead do not use up the limit. A paper asked for by id is shown
 * whatever its date, which is how a dry run on a future paper is found. With
 * `userId`, one person's whole history (PRD 6.9: "view any student's attempt
 * history"), every paper they have attempted.
 */
export async function getAttemptsByTest(
  { testId, userId, trackId }: { testId?: string; userId?: string; trackId?: string } = {},
): Promise<AdminTestAttempts[]> {
  const client = db()

  let testQuery = client.from('tests').select(`id, title, ${PAPER_WINDOW_COLUMNS}`)
    .order('date', { ascending: false })
  if (testId) testQuery = testQuery.eq('id', testId)
  else if (!userId) testQuery = testQuery.lte('date', istDate()).limit(30)
  // Scoped like every other console screen. Without it two exams' papers sit
  // in one list, and on a day both ran they are two rows with the same date.
  if (trackId && !testId) testQuery = testQuery.eq('track_id', trackId)
  const { data: tests, error: testError } = await testQuery
  if (testError) throw new Error(`Could not list the papers: ${testError.message}`)
  if (!tests?.length) return []

  let attemptQuery = client
    .from('attempts')
    .select('id, test_id, user_id, state, is_dry_run, total_score, attempted, correct, not_reached, time_spent_sec, fullscreen_exits, tab_switches, submitted_at, profiles(username, display_name)')
    .in('test_id', tests.map((t) => t.id as string))
    // Dry runs are the admin's own rehearsals and are counted nowhere, so
    // listing them here only made the console look as though more people had
    // sat the paper than had. The engine still needs the row while the
    // rehearsal runs; this screen never does.
    .eq('is_dry_run', false)
    .order('total_score', { ascending: false, nullsFirst: false })
  if (userId) attemptQuery = attemptQuery.eq('user_id', userId)
  const { data: attempts, error: attemptError } = await attemptQuery
  if (attemptError) throw new Error(`Could not list the attempts: ${attemptError.message}`)

  const byTest = new Map<string, AdminAttemptRow[]>()
  for (const a of attempts ?? []) {
    const p = a.profiles as unknown as { username: string; display_name: string }
    const row: AdminAttemptRow = {
      id: a.id as string,
      userId: a.user_id as string,
      username: p.username,
      displayName: p.display_name,
      state: a.state as string,
      isDryRun: a.is_dry_run as boolean,
      totalScore: a.total_score === null ? null : Number(a.total_score),
      attempted: (a.attempted as number | null) ?? null,
      correct: (a.correct as number | null) ?? null,
      notReached: (a.not_reached as number | null) ?? null,
      timeSpentSec: (a.time_spent_sec as number | null) ?? null,
      fullscreenExits: (a.fullscreen_exits as number) ?? 0,
      tabSwitches: (a.tab_switches as number) ?? 0,
      submittedAt: (a.submitted_at as string | null) ?? null,
    }
    const list = byTest.get(a.test_id as string) ?? []
    list.push(row)
    byTest.set(a.test_id as string, list)
  }

  return tests
    .map((t) => ({
      testId: t.id as string,
      date: t.date as string,
      title: (t.title as string | null) ?? null,
      window: paperWindowOf(t as Record<string, unknown>),
      attempts: byTest.get(t.id as string) ?? [],
    }))
    .filter((t) => t.attempts.length > 0)
}

/**
 * Voiding keeps the row for audit but takes it off the leaderboard (FR-6.7.4).
 *
 * Only a finished, counted attempt can be voided. An attempt still in
 * progress would be flipped back when it submits, and a dry run is never on
 * the leaderboard to begin with. The filters make that part of the write.
 */
export async function voidAttempt(attemptId: string): Promise<void> {
  const { data, error } = await db()
    .from('attempts')
    .update({ state: 'VOIDED' })
    .eq('id', attemptId)
    .eq('is_dry_run', false)
    .in('state', [...FINISHED_STATES])
    .select('id')
  if (error) throw new Error(`Could not void that attempt: ${error.message}`)
  if (!data?.length) throw new Error('Only a finished, counted attempt can be voided.')
}

/**
 * Remove one student's attempt so they can sit the paper again.
 *
 * Voiding does not free the slot and was never meant to: a voided row stays
 * for the record, and `attempts_one_real_per_user_per_test` has no state
 * predicate, so the student is still redirected to their result page and
 * start_attempt still raises ALREADY_TAKEN. "It does not count" and "have
 * another go" are different requests, and until now only the first had a
 * button.
 *
 * This is the second, and it is a deletion rather than a flag: the answers,
 * the per-question timings and the score go with the row (they cascade), and
 * the leaderboard loses it because there is nothing left to count. There is no
 * undo. The console asks twice and names what goes.
 *
 * Dry runs are excluded because they never blocked anything -- the engine
 * clears the previous one itself when a new rehearsal starts.
 *
 * An attempt still in progress may be cleared too. That is deliberate: a
 * student stuck in one cannot start any paper at all
 * (`attempts_one_live_per_user`), and freeing them is exactly what this is
 * for. Their engine finds the attempt gone on its next write and returns them
 * to the dashboard.
 */
export async function clearAttempt(attemptId: string): Promise<void> {
  const { data, error } = await db()
    .from('attempts')
    .delete()
    .eq('id', attemptId)
    .eq('is_dry_run', false)
    .select('id')
  if (error) throw new Error(`Could not clear that attempt: ${error.message}`)
  if (!data?.length) throw new Error('That attempt is not there, or it is a dry run.')
}
