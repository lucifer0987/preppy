import 'server-only'
import { db } from '../supabase/admin'

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
  attempts: AdminAttemptRow[]
}

export async function getAttemptsByTest(testId?: string): Promise<AdminTestAttempts[]> {
  const client = db()

  let testQuery = client.from('tests').select('id, date, title').order('date', { ascending: false })
  if (testId) testQuery = testQuery.eq('id', testId)
  const { data: tests } = await testQuery.limit(30)
  if (!tests?.length) return []

  const { data: attempts } = await client
    .from('attempts')
    .select('id, test_id, state, is_dry_run, total_score, attempted, correct, not_reached, time_spent_sec, fullscreen_exits, tab_switches, submitted_at, profiles(username, display_name)')
    .in('test_id', tests.map((t) => t.id as string))
    .order('total_score', { ascending: false, nullsFirst: false })

  const byTest = new Map<string, AdminAttemptRow[]>()
  for (const a of attempts ?? []) {
    const p = a.profiles as unknown as { username: string; display_name: string }
    const row: AdminAttemptRow = {
      id: a.id as string,
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
      attempts: byTest.get(t.id as string) ?? [],
    }))
    .filter((t) => t.attempts.length > 0)
}

/** Voiding keeps the row for audit but takes it off the leaderboard (FR-6.7.4). */
export async function voidAttempt(attemptId: string): Promise<void> {
  const { error } = await db().from('attempts').update({ state: 'VOIDED' }).eq('id', attemptId)
  if (error) throw new Error(`Could not void that attempt: ${error.message}`)
}
