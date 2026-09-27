import 'server-only'
import { db } from '../supabase/admin'
import { selectAll } from './select-all'
import {
  buildLeaderboard, paperRank, rankDelta, type AttemptRecord, type LeaderboardRow,
} from '../leaderboard'
import { istDate, paperClosed, type PaperWindow } from '../time'
import { finaliseOverdueAttempts } from './finalise'

const COUNTED_STATES = ['SUBMITTED', 'AUTO_SUBMITTED']

interface Counted {
  records: AttemptRecord[]
  /** Every paper on the board, ascending. */
  paperKeys: string[]
  /** What a perfect paper is worth, per paper key. */
  maxByPaper: Map<string, number>
  /**
   * The subset that has closed, for streaks. A paper still open is on the
   * board the moment somebody finishes it, but it must not break the streak
   * of the four who have not sat it yet.
   */
  settledKeys: string[]
}

/** `YYYY-MM-DD#MMMM`: identifies one paper and orders it against the rest. */
export const paperKeyOf = (w: Pick<PaperWindow, 'date' | 'opensAtMin'>) =>
  `${w.date}#${String(w.opensAtMin).padStart(4, '0')}`

const windowOf = (t: Record<string, unknown>): PaperWindow => ({
  date: t['date'] as string,
  opensAtMin: t['opens_at_min'] as number,
  entryClosesAtMin: t['entry_closes_at_min'] as number,
  attemptMinutes: Math.round((t['attempt_sec'] as number) / 60),
  // A paper an admin ended early joins the board from that moment, not from
  // the hard stop its times would have given it.
  endedAt: (t['ended_at'] as string | null) ?? null,
})

/**
 * Every counted attempt on every paper the board includes.
 *
 * A paper joins the board the moment the first student finishes it, and in any
 * case once it closes. That is a deliberate reversal: everything used to wait
 * for the paper's hard stop so that nobody could read off the board who had
 * already sat it. Waiting turned out to cost more than it bought -- a student
 * who finishes at nine in the morning should not be told to come back at
 * midnight for their rank -- so the board is live, and what it gives away is
 * participation, never answers. A paper's questions stay shut to anybody who
 * has not finished it (see getPaperStandings and the archive).
 *
 * Attempts left open past their hard stop are scored first. The finalise job
 * would get to them, but the board is read continuously, and a student whose
 * browser died must not be missing from it.
 *
 * `is_dry_run = false` is the whole of the admin exclusion (FR-5.2): admin
 * attempts are always dry runs, so there is no role check to forget here or
 * anywhere else. VOIDED and IN_PROGRESS are excluded by state (FR-6.7.4).
 */
async function loadCounted(trackId: string, now = new Date()): Promise<Counted> {
  const client = db()

  // Today is a cheap upper bound; which papers have actually closed depends on
  // each one's own times, so the real filter happens here rather than in SQL.
  const candidates = await selectAll<Record<string, unknown>>('papers', (from, to) =>
    client.from('tests')
      // sections come along so the board can say what a total is out of: the
      // header reads "Total of 385", and 385 is the sum of the perfect scores
      // of the papers in the window.
      .select('id, date, opens_at_min, entry_closes_at_min, attempt_sec, ended_at, sections(question_count, marks_correct)')
      .eq('status', 'SCHEDULED').eq('track_id', trackId).lte('date', istDate(now))
      .order('date').range(from, to))

  const tests = candidates
    .map((t) => ({
      id: t['id'] as string,
      window: windowOf(t),
      maxMarks: ((t['sections'] ?? []) as { question_count: number; marks_correct: number }[])
        .reduce((n, sec) => n + sec.question_count * Number(sec.marks_correct), 0),
    }))
    .sort((a, b) => paperKeyOf(a.window).localeCompare(paperKeyOf(b.window)))

  if (!tests.length) return { records: [], paperKeys: [], settledKeys: [], maxByPaper: new Map() }

  await finaliseOverdueAttempts(now).catch((e: Error) => console.error('[leaderboard] finalise', e.message))

  // tests!inner applies the paper filters to the attempt rows themselves,
  // instead of listing every paper id in a URL that grows every night.
  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    client.from('attempts')
      .select('id, user_id, total_score, correct, attempted, time_spent_sec, profiles(username, display_name), tests!inner(date, status, track_id, opens_at_min, entry_closes_at_min, attempt_sec, ended_at)')
      .eq('is_dry_run', false)
      .in('state', COUNTED_STATES)
      .eq('tests.status', 'SCHEDULED')
      .eq('tests.track_id', trackId)
      .lte('tests.date', istDate(now))
      .order('id')
      .range(from, to))

  const records: AttemptRecord[] = attempts.flatMap((a) => {
    const p = a['profiles'] as { username: string; display_name: string }
    const t = a['tests'] as Record<string, unknown>
    const key = paperKeyOf(windowOf(t))
    return [{
      userId: a['user_id'] as string,
      username: p.username,
      displayName: p.display_name,
      paperKey: key,
      totalScore: Number(a['total_score'] ?? 0),
      correct: (a['correct'] as number | null) ?? 0,
      attempted: (a['attempted'] as number | null) ?? 0,
      timeSpentSec: (a['time_spent_sec'] as number | null) ?? 0,
    }]
  })

  // On the board: a paper somebody has finished, or one that has closed. A
  // paper nobody sat still joins at its close, because skipping it has to
  // count against a streak -- and until then it is not a paper yet.
  const sat = new Set(records.map((r) => r.paperKey))
  const settledKeys = tests.filter((t) => paperClosed(t.window, now)).map((t) => paperKeyOf(t.window))
  const settled = new Set(settledKeys)
  const paperKeys = tests
    .map((t) => paperKeyOf(t.window))
    .filter((k) => sat.has(k) || settled.has(k))

  const maxByPaper = new Map(tests.map((t) => [paperKeyOf(t.window), t.maxMarks]))
  return {
    records: records.filter((r) => paperKeys.includes(r.paperKey)),
    paperKeys, settledKeys, maxByPaper,
  }
}

/**
 * How many papers the board counts unless asked otherwise.
 *
 * A board that never resets slowly becomes a record of who joined first.
 * Recent form is the part a student can still do something about, so that is
 * what they are shown first; all time is one press away and still never
 * resets.
 */
export const DEFAULT_BOARD_PAPERS = 7

export interface Board {
  rows: LeaderboardRow[]
  /**
   * What a perfect run of the papers in this window would have scored, so the
   * header can say "Total of 385" rather than leaving the reader to guess what
   * a total is out of. Papers, not students: it is the same number for
   * everybody on the board.
   */
  maxMarks: number
  /** How many papers the window covers. */
  papers: number
}

/**
 * Throws on a failed read, so a database error never renders as an empty board.
 *
 * One board per track. A student follows one exam, and a table mixing two of
 * them would rank people against papers they were never offered.
 */
export async function getLeaderboard(
  trackId: string, options: { lastN?: number } = {},
): Promise<Board> {
  const { records, paperKeys, settledKeys, maxByPaper } = await loadCounted(trackId)
  if (!paperKeys.length) return { rows: [], maxMarks: 0, papers: 0 }
  const inScope = options.lastN ? paperKeys.slice(-options.lastN) : paperKeys
  return {
    rows: buildLeaderboard(records, paperKeys, { ...options, streakKeys: settledKeys }),
    maxMarks: Math.round(inScope.reduce((n, k) => n + (maxByPaper.get(k) ?? 0), 0) * 100) / 100,
    papers: inScope.length,
  }
}

export interface ResultStanding {
  /** "2nd of 5" on this paper alone. Null when the attempt does not count. */
  paper: { rank: number; of: number; percentile: number | null } | null
  /** All-time rank just before this paper and just after it. */
  board: { before: number | null; after: number | null; of: number }
}

/**
 * The rank figures on the result page (PRD 6.6).
 *
 * Available the moment the attempt is scored, not when the paper closes. While
 * entry is still open they are a standing among those who have finished so
 * far, and the page says so rather than presenting a number that will move as
 * if it were final.
 */
export async function getResultStanding(
  userId: string, w: PaperWindow, trackId: string,
): Promise<ResultStanding | null> {
  const paperKey = paperKeyOf(w)
  const { records } = await loadCounted(trackId)
  return {
    paper: paperRank(records, userId, paperKey),
    board: rankDelta(records, userId, paperKey),
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
export async function getPaperStandings(
  testId: string,
  /**
   * Who is asking. A student sees a paper's rank list once they have finished
   * that paper, or once it has closed -- never before, because a list of
   * scores on a paper you are about to sit tells you how hard it is. Omitted
   * for the console, where an admin sees everything.
   */
  viewerId?: string,
): Promise<{ date: string; rows: PaperStandingRow[] } | null> {
  const { data: test, error } = await db()
    .from('tests').select('date, status, opens_at_min, entry_closes_at_min, attempt_sec, ended_at').eq('id', testId).maybeSingle()
  if (error) throw new Error(`Could not load the paper: ${error.message}`)
  if (!test || test.status !== 'SCHEDULED') return null
  if (viewerId && !paperClosed(windowOf(test)) && !(await hasFinished(testId, viewerId))) return null
  // As for the board: anyone left open past the hard stop is scored first, so
  // the two views never disagree between a paper closing and the daily job.
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

/** Whether this student has a counted, finished attempt on this paper. */
async function hasFinished(testId: string, userId: string): Promise<boolean> {
  const { count, error } = await db()
    .from('attempts').select('id', { count: 'exact', head: true })
    .eq('test_id', testId).eq('user_id', userId).eq('is_dry_run', false)
    .in('state', COUNTED_STATES)
  if (error) throw new Error(`Could not check your attempt: ${error.message}`)
  return (count ?? 0) > 0
}

/**
 * Papers with a rank list to show, newest first.
 *
 * For a student, the ones they may look at: finished by them, or closed. For
 * the console (`viewerId` omitted), every paper that has been sat at all.
 */
export async function boardPapers(
  trackId: string, viewerId?: string,
): Promise<{ id: string; date: string; title: string | null }[]> {
  const candidates = await selectAll<Record<string, unknown>>('papers', (from, to) =>
    db().from('tests').select('id, date, title, opens_at_min, entry_closes_at_min, attempt_sec, ended_at')
      .eq('status', 'SCHEDULED').eq('track_id', trackId).lte('date', istDate())
      .order('date', { ascending: false }).range(from, to))

  const mine = viewerId ? await finishedTestIds(viewerId) : null
  const sat = await satTestIds()

  return candidates
    .filter((t) => {
      const id = t['id'] as string
      if (!paperClosed(windowOf(t)) && !(mine ? mine.has(id) : sat.has(id))) return false
      // A paper nobody sat has an empty rank list; it is still worth offering
      // once it has closed, because "nobody sat it" is itself an answer.
      return true
    })
    .sort((a, b) => paperKeyOf(windowOf(b)).localeCompare(paperKeyOf(windowOf(a))))
    .map((t) => ({ id: t['id'] as string, date: t['date'] as string, title: (t['title'] as string | null) ?? null }))
}

/** Every paper this student has finished. */
async function finishedTestIds(userId: string): Promise<Set<string>> {
  const rows = await selectAll<Record<string, unknown>>('my attempts', (from, to) =>
    db().from('attempts').select('test_id')
      .eq('user_id', userId).eq('is_dry_run', false).in('state', COUNTED_STATES)
      .order('id').range(from, to))
  return new Set(rows.map((r) => r['test_id'] as string))
}

/** Every paper anybody has finished. */
async function satTestIds(): Promise<Set<string>> {
  const rows = await selectAll<Record<string, unknown>>('sat papers', (from, to) =>
    db().from('attempts').select('test_id')
      .eq('is_dry_run', false).in('state', COUNTED_STATES)
      .order('id').range(from, to))
  return new Set(rows.map((r) => r['test_id'] as string))
}

export interface ArchiveRow {
  testId: string
  date: string
  title: string | null
  attemptId: string | null
  score: number | null
  /** Null when this student has not sat it. Provisional until `settled`. */
  rank: number | null
  cohortSize: number | null
  /** Entry is over, so this rank can no longer move. */
  settled: boolean
}

/**
 * The archive (PRD 6.3, panel 2).
 *
 * A paper is here once this student has finished it, and once it has closed it
 * is here for everybody -- including whoever never sat it, who may still read
 * every question and its solution (FR-6.3.2). What is never here is a paper
 * that is still open to this student: that is the one thing the archive must
 * not hand over early.
 *
 * Shows this student's own score and rank and nothing about anyone else
 * (FR-5.3). Rank needs the cohort's scores to compute, but only the student's
 * position and the cohort size are ever returned.
 */
export async function getArchive(userId: string, trackId: string): Promise<ArchiveRow[]> {
  const client = db()
  const today = istDate()

  // The date filter is only an upper bound; the real one is below.
  const [candidates, mine] = await Promise.all([
    selectAll<Record<string, unknown>>('papers', (from, to) =>
      client.from('tests').select('id, date, title, opens_at_min, entry_closes_at_min, attempt_sec, ended_at')
        .eq('status', 'SCHEDULED').eq('track_id', trackId).lte('date', today)
        .order('date', { ascending: false }).range(from, to)),
    finishedTestIds(userId),
  ])

  const tests = candidates
    .filter((t) => paperClosed(windowOf(t)) || mine.has(t['id'] as string))
    .sort((a, b) => paperKeyOf(windowOf(b)).localeCompare(paperKeyOf(windowOf(a))))
    .map((t) => ({
      id: t['id'] as string,
      date: t['date'] as string,
      title: (t['title'] as string | null) ?? null,
      /** Settled: entry is over, so the rank cannot move any more. */
      closed: paperClosed(windowOf(t)),
    }))
  if (!tests.length) return []

  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    client.from('attempts')
      .select('id, test_id, user_id, total_score, tests!inner(date, status, track_id)')
      .eq('is_dry_run', false)
      .in('state', COUNTED_STATES)
      .eq('tests.status', 'SCHEDULED')
      .eq('tests.track_id', trackId)
      .lte('tests.date', today)
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
    const ours = all.find((a) => a.userId === userId)
    return {
      testId: t.id,
      date: t.date,
      title: t.title ?? null,
      attemptId: ours?.id ?? null,
      score: ours ? ours.score : null,
      // Competition ranking, so equal scores share a place. Counted among
      // everybody who has finished so far, which is the whole cohort once the
      // paper has closed and fewer than that while it is still open.
      rank: ours ? all.filter((a) => a.score > ours.score).length + 1 : null,
      cohortSize: all.length,
      settled: t.closed,
    }
  })
}
