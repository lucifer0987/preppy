import 'server-only'
import { db } from '../supabase/admin'
import { buildLeaderboard, type AttemptRecord, type LeaderboardRow } from '../leaderboard'
import { istDate } from '../time'

/**
 * Reads the counted attempts and hands them to the pure aggregator.
 *
 * `is_dry_run = false` is the whole of the admin exclusion (FR-5.2): admin
 * attempts are always dry runs, so there is no role check to forget here or
 * anywhere else.
 */
export async function getLeaderboard(options: { lastN?: number } = {}): Promise<LeaderboardRow[]> {
  const client = db()

  // Only papers that have actually run; tonight's is excluded until it closes,
  // so the board never moves while people are still sitting the paper.
  const { data: tests } = await client
    .from('tests').select('id, date').eq('status', 'SCHEDULED').lt('date', istDate()).order('date')

  const testDates = (tests ?? []).map((t) => t.date as string)
  if (!testDates.length) return []
  const dateById = new Map((tests ?? []).map((t) => [t.id as string, t.date as string]))

  const { data: attempts } = await client
    .from('attempts')
    .select('test_id, user_id, total_score, correct, attempted, time_spent_sec, profiles(username, display_name)')
    .eq('is_dry_run', false)
    .in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])
    .in('test_id', [...dateById.keys()])

  const records: AttemptRecord[] = (attempts ?? []).map((a) => {
    const p = a.profiles as unknown as { username: string; display_name: string }
    return {
      userId: a.user_id as string,
      username: p.username,
      displayName: p.display_name,
      testDate: dateById.get(a.test_id as string)!,
      totalScore: Number(a.total_score ?? 0),
      correct: (a.correct as number) ?? 0,
      attempted: (a.attempted as number) ?? 0,
      timeSpentSec: (a.time_spent_sec as number) ?? 0,
    }
  })

  return buildLeaderboard(records, testDates, options)
}

export interface ArchiveRow {
  testId: string
  date: string
  title: string | null
  attemptId: string | null
  score: number | null
  rank: number | null
  cohortSize: number
}

/**
 * The archive (PRD 6.3, panel 2).
 *
 * Shows this student's own score and rank and nothing about anyone else
 * (FR-5.3). Rank needs the cohort's scores to compute, but only the student's
 * position and the cohort size are ever returned.
 */
export async function getArchive(userId: string): Promise<ArchiveRow[]> {
  const client = db()
  const { data: tests } = await client
    .from('tests').select('id, date, title').eq('status', 'SCHEDULED').lt('date', istDate())
    .order('date', { ascending: false })
  if (!tests?.length) return []

  const testIds = tests.map((t) => t.id as string)
  const { data: attempts } = await client
    .from('attempts')
    .select('id, test_id, user_id, total_score')
    .eq('is_dry_run', false)
    .in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])
    .in('test_id', testIds)

  const byTest = new Map<string, { id: string; userId: string; score: number }[]>()
  for (const a of attempts ?? []) {
    const list = byTest.get(a.test_id as string) ?? []
    list.push({ id: a.id as string, userId: a.user_id as string, score: Number(a.total_score ?? 0) })
    byTest.set(a.test_id as string, list)
  }

  return tests.map((t) => {
    const all = (byTest.get(t.id as string) ?? []).sort((x, y) => y.score - x.score)
    const mine = all.find((a) => a.userId === userId)
    return {
      testId: t.id as string,
      date: t.date as string,
      title: (t.title as string | null) ?? null,
      attemptId: mine?.id ?? null,
      score: mine ? mine.score : null,
      // Competition ranking, so equal scores share a place.
      rank: mine ? all.filter((a) => a.score > mine.score).length + 1 : null,
      cohortSize: all.length,
    }
  })
}
