import 'server-only'
import { db } from '../supabase/admin'
import { selectAll } from './select-all'
import {
  buildLeaderboard, paperRank, rankDelta, type AttemptRecord, type LeaderboardRow,
} from '../leaderboard'
import { istDate, latestBoardDate, onBoard } from '../time'
import { finaliseOverdueAttempts } from './finalise'

const COUNTED_STATES = ['SUBMITTED', 'AUTO_SUBMITTED']

interface Counted {
  records: AttemptRecord[]
  /** Every paper on the board, ascending. */
  testDates: string[]
}

/**
 * Every counted attempt on every paper the board includes.
 *
 * A paper joins the board at 00:01 the morning after it runs (lib/time.ts
 * onBoard), so nothing about tonight is visible to anyone else while it is
 * open. Its own attempt is visible to its owner at once, on the result page.
 *
 * Attempts left open past their hard stop are scored first. The 00:05 job
 * would get to them, but the board is read from 00:01, and a student whose
 * browser died must not be missing from it for those minutes.
 *
 * `is_dry_run = false` is the whole of the admin exclusion (FR-5.2): admin
 * attempts are always dry runs, so there is no role check to forget here or
 * anywhere else. VOIDED and IN_PROGRESS are excluded by state (FR-6.7.4).
 */
async function loadCounted(now = new Date()): Promise<Counted> {
  const client = db()
  const lastDate = latestBoardDate(now)

  const tests = await selectAll<{ id: string; date: string }>('papers', (from, to) =>
    client.from('tests').select('id, date')
      .eq('status', 'SCHEDULED').lte('date', lastDate)
      .order('date').range(from, to))

  const testDates = tests.map((t) => t.date)
  if (!testDates.length) return { records: [], testDates }

  await finaliseOverdueAttempts(now).catch((e: Error) => console.error('[leaderboard] finalise', e.message))

  // tests!inner applies the paper filters to the attempt rows themselves,
  // instead of listing every paper id in a URL that grows every night.
  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    client.from('attempts')
      .select('id, user_id, total_score, correct, attempted, time_spent_sec, profiles(username, display_name), tests!inner(date, status)')
      .eq('is_dry_run', false)
      .in('state', COUNTED_STATES)
      .eq('tests.status', 'SCHEDULED')
      .lte('tests.date', lastDate)
      .order('id')
      .range(from, to))

  const records: AttemptRecord[] = attempts.map((a) => {
    const p = a['profiles'] as { username: string; display_name: string }
    const t = a['tests'] as { date: string }
    return {
      userId: a['user_id'] as string,
      username: p.username,
      displayName: p.display_name,
      testDate: t.date,
      totalScore: Number(a['total_score'] ?? 0),
      correct: (a['correct'] as number | null) ?? 0,
      attempted: (a['attempted'] as number | null) ?? 0,
      timeSpentSec: (a['time_spent_sec'] as number | null) ?? 0,
    }
  })

  return { records, testDates }
}

/** Throws on a failed read, so a database error never renders as an empty board. */
export async function getLeaderboard(options: { lastN?: number } = {}): Promise<LeaderboardRow[]> {
  const { records, testDates } = await loadCounted()
  if (!testDates.length) return []
  return buildLeaderboard(records, testDates, options)
}

export interface ResultStanding {
  /** "2nd of 5" on this paper alone. Null when the attempt does not count. */
  paper: { rank: number; of: number } | null
  /** All-time rank just before this paper and just after it. */
  board: { before: number | null; after: number | null; of: number }
}

/**
 * The rank figures on the result page (PRD 6.6), or null while the paper is
 * not yet on the board: they compare the student with everyone else, so they
 * wait for 00:01 like the board itself.
 */
export async function getResultStanding(userId: string, testDate: string): Promise<ResultStanding | null> {
  if (!onBoard(testDate)) return null
  const { records } = await loadCounted()
  return {
    paper: paperRank(records, userId, testDate),
    board: rankDelta(records, userId, testDate),
  }
}

export interface PaperStandingRow {
  rank: number
  userId: string
  displayName: string
  score: number
  accuracyPct: number | null
}

/**
 * A single paper's rank list (PRD 6.7 filter): the leaderboard's own view of
 * one night, by score alone (FR-3.3), equal scores sharing a place. Only for a
 * paper on the board.
 */
export async function getPaperStandings(testId: string): Promise<{ date: string; rows: PaperStandingRow[] } | null> {
  const { data: test, error } = await db().from('tests').select('date, status').eq('id', testId).maybeSingle()
  if (error) throw new Error(`Could not load the paper: ${error.message}`)
  if (!test || test.status !== 'SCHEDULED' || !onBoard(test.date as string)) return null
  // As for the board: anyone left open past the hard stop is scored first, so
  // the two views never disagree between 00:01 and the 00:05 job.
  await finaliseOverdueAttempts().catch((e: Error) => console.error('[leaderboard] finalise', e.message))

  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    db().from('attempts')
      .select('id, user_id, total_score, correct, attempted, profiles(display_name)')
      .eq('test_id', testId).eq('is_dry_run', false).in('state', COUNTED_STATES)
      .order('id').range(from, to))

  const rows = attempts
    .map((a) => {
      const attempted = (a['attempted'] as number | null) ?? 0
      return {
        rank: 0,
        userId: a['user_id'] as string,
        displayName: (a['profiles'] as { display_name: string }).display_name,
        score: Number(a['total_score'] ?? 0),
        accuracyPct: attempted === 0 ? null : Math.round((((a['correct'] as number) ?? 0) / attempted) * 1000) / 10,
      }
    })
    .sort((x, y) => y.score - x.score || x.displayName.localeCompare(y.displayName))
  for (const row of rows) row.rank = rows.filter((o) => o.score > row.score).length + 1
  return { date: test.date as string, rows }
}

/** Papers with a rank list to show: every paper on the board, newest first. */
export async function boardPapers(): Promise<{ id: string; date: string; title: string | null }[]> {
  const tests = await selectAll<{ id: string; date: string; title: string | null }>('papers', (from, to) =>
    db().from('tests').select('id, date, title')
      .eq('status', 'SCHEDULED').lte('date', latestBoardDate())
      .order('date', { ascending: false }).range(from, to))
  return tests
}

export interface ArchiveRow {
  testId: string
  date: string
  title: string | null
  attemptId: string | null
  score: number | null
  /** Null until the paper is on the board (00:01), or when not attempted. */
  rank: number | null
  cohortSize: number | null
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
  const today = istDate()

  const tests = await selectAll<{ id: string; date: string; title: string | null }>('papers', (from, to) =>
    client.from('tests').select('id, date, title')
      .eq('status', 'SCHEDULED').lt('date', today)
      .order('date', { ascending: false }).range(from, to))
  if (!tests.length) return []

  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    client.from('attempts')
      .select('id, test_id, user_id, total_score, tests!inner(date, status)')
      .eq('is_dry_run', false)
      .in('state', COUNTED_STATES)
      .eq('tests.status', 'SCHEDULED')
      .lt('tests.date', today)
      .order('id')
      .range(from, to))

  const byTest = new Map<string, { id: string; userId: string; score: number }[]>()
  for (const a of attempts) {
    const list = byTest.get(a['test_id'] as string) ?? []
    list.push({ id: a['id'] as string, userId: a['user_id'] as string, score: Number(a['total_score'] ?? 0) })
    byTest.set(a['test_id'] as string, list)
  }

  return tests.map((t) => {
    const all = byTest.get(t.id) ?? []
    const mine = all.find((a) => a.userId === userId)
    const ranked = onBoard(t.date)
    return {
      testId: t.id,
      date: t.date,
      title: t.title ?? null,
      attemptId: mine?.id ?? null,
      score: mine ? mine.score : null,
      // Competition ranking, so equal scores share a place. Like the board,
      // it waits for 00:01: the night's paper closes at midnight, its ranks
      // appear a minute later.
      rank: mine && ranked ? all.filter((a) => a.score > mine.score).length + 1 : null,
      cohortSize: ranked ? all.length : null,
    }
  })
}
