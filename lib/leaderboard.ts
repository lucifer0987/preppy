/**
 * The leaderboard (PRD section 6.7).
 *
 * Computed on read (FR-6.7.3). Five students across a few hundred papers is a
 * trivial aggregate, and a stored snapshot would need its own invalidation
 * story after a rescore. Nothing is precomputed, so nothing can go stale.
 *
 * Pure, so the tie-breaks and the streak rule can be tested without a
 * database — both are easy to get subtly wrong and neither announces itself
 * when it is.
 */

export interface AttemptRecord {
  userId: string
  displayName: string
  username: string
  /** The paper's date, not the submission instant. */
  /**
   * Identifies one paper and orders it against the others:
   * `YYYY-MM-DD#MMMM`, the date plus the minute it opened. A plain date stopped
   * working when a day could hold more than one paper, and every comparison
   * here is lexicographic, so the composite key slots in unchanged.
   */
  paperKey: string
  totalScore: number
  correct: number
  attempted: number
  timeSpentSec: number
}

export interface LeaderboardRow {
  rank: number
  /** Positions gained since before the most recent paper. Null for a newcomer. */
  movement: number | null
  userId: string
  displayName: string
  username: string
  totalPoints: number
  testsTaken: number
  avgScore: number
  accuracyPct: number | null
  bestScore: number
  currentStreak: number
  /** The longest run of consecutive papers sat, ever (PRD 6.8). */
  longestStreak: number
}

export interface LeaderboardOptions {
  /** Restrict to the most recent N papers. Omit for all time. */
  lastN?: number
  /**
   * The papers a streak is measured over. Defaults to every paper on the
   * board.
   *
   * These differ once a paper counts from the moment somebody finishes it
   * rather than from its close: the first student to hand in puts that paper
   * on the board, and if streaks ran over the same list, the four who have not
   * sat it yet would watch their streak break and then heal an hour later.
   * A streak is about the day, so it waits for the day's paper to settle.
   */
  streakKeys?: string[]
}

/**
 * @param records   one row per counted attempt on a paper the board includes
 *                  (lib/time.ts onBoard). Dry runs must already be excluded,
 *                  which excludes the admin by construction (FR-5.2).
 * @param paperKeys every paper on the board, ascending -- one somebody has
 *                  finished, or one that has closed.
 * @param options.streakKeys the papers that have settled, for streaks. A day
 *                  with no paper must not break one, and neither must a paper
 *                  still open to the person whose streak it is.
 */
/** The IST date half of a `YYYY-MM-DD#MMMM` paper key. */
const dayOf = (paperKey: string) => paperKey.split('#')[0]!

export function buildLeaderboard(
  records: AttemptRecord[],
  paperKeys: string[],
  options: LeaderboardOptions = {},
): LeaderboardRow[] {
  const dates = [...new Set(paperKeys)].sort()
  const inScope = options.lastN ? dates.slice(-options.lastN) : dates
  const scoped = records.filter((r) => inScope.includes(r.paperKey))

  // A streak is about turning up night after night, so it always runs over
  // every paper that has run, whatever window the board is showing. Inside
  // "Last 7" it would otherwise be capped at 7.
  // ...and it counts days, not papers. Once a day can hold two, a student who
  // reliably sits the evening paper would otherwise have the morning one they
  // skipped break the chain every single day. Turning up at all counts.
  const days = [...new Set((options.streakKeys ?? paperKeys).map(dayOf))].sort()
  const attendance = new Map<string, Set<string>>()
  for (const r of records) {
    const set = attendance.get(r.userId)
    if (set) set.add(dayOf(r.paperKey))
    else attendance.set(r.userId, new Set([dayOf(r.paperKey)]))
  }
  const streaksOf = (userId: string) => streaks(attendance.get(userId) ?? new Set(), days)

  const current = aggregate(scoped, streaksOf)

  // Movement compares against the same view as it stood before the latest
  // paper: for "Last 30", the 30 papers that ended one paper earlier.
  const earlier = dates.slice(0, -1)
  const previousDates = options.lastN ? earlier.slice(-options.lastN) : earlier
  const previous = previousDates.length
    ? aggregate(records.filter((r) => previousDates.includes(r.paperKey)), streaksOf)
    : []
  const previousRank = new Map(previous.map((r) => [r.userId, r.rank]))

  return current.map((row) => ({
    ...row,
    movement: previousRank.has(row.userId) ? previousRank.get(row.userId)! - row.rank : null,
  }))
}

/**
 * Where one student stood on the all-time board just before a paper and just
 * after it (PRD 6.6, "leaderboard delta"). Null on either side means they
 * were not on the board at that point: before their first paper, or for an
 * attempt that does not count.
 */
export function rankDelta(
  records: AttemptRecord[], userId: string, paperKey: string,
): { before: number | null; after: number | null; of: number } {
  const rankAt = (keep: (d: string) => boolean) => {
    const board = aggregate(records.filter((r) => keep(r.paperKey)), () => ({ current: 0, longest: 0 }))
    return { rank: board.find((r) => r.userId === userId)?.rank ?? null, size: board.length }
  }
  const after = rankAt((d) => d <= paperKey)
  return { before: rankAt((d) => d < paperKey).rank, after: after.rank, of: after.size }
}

/**
 * "2nd of 5" for a single paper (PRD 6.6). Rank on one paper is its score
 * alone (FR-3.3), and equal scores share a place. Null when this student has
 * no counted attempt on the paper.
 */
export function paperRank(
  records: AttemptRecord[], userId: string, paperKey: string,
): { rank: number; of: number } | null {
  const cohort = records.filter((r) => r.paperKey === paperKey)
  const mine = cohort.find((r) => r.userId === userId)
  if (!mine) return null
  return {
    rank: cohort.filter((r) => r.totalScore > mine.totalScore).length + 1,
    of: cohort.length,
  }
}

function aggregate(
  records: AttemptRecord[], streaksOf: (userId: string) => { current: number; longest: number },
): Omit<LeaderboardRow, 'movement'>[] {
  const byUser = new Map<string, AttemptRecord[]>()
  for (const r of records) {
    const list = byUser.get(r.userId)
    if (list) list.push(r)
    else byUser.set(r.userId, [r])
  }

  const rows = [...byUser.entries()].map(([userId, attempts]) => {
    const totalPoints = round2(attempts.reduce((a, r) => a + r.totalScore, 0))
    const correct = attempts.reduce((a, r) => a + r.correct, 0)
    const attempted = attempts.reduce((a, r) => a + r.attempted, 0)
    const first = attempts.reduce((a, r) => (r.paperKey < a ? r.paperKey : a), attempts[0]!.paperKey)

    return {
      rank: 0,
      userId,
      displayName: attempts[0]!.displayName,
      username: attempts[0]!.username,
      totalPoints,
      testsTaken: attempts.length,
      avgScore: round2(totalPoints / attempts.length),
      accuracyPct: attempted === 0 ? null : round2((correct / attempted) * 100),
      bestScore: round2(Math.max(...attempts.map((r) => r.totalScore))),
      currentStreak: streaksOf(userId).current,
      longestStreak: streaksOf(userId).longest,
      cumulativeTimeSec: attempts.reduce((a, r) => a + r.timeSpentSec, 0),
      firstAttemptDate: first,
    }
  })

  // FR-6.7.2, in order: total, average, accuracy, best.
  //
  // Average sits second because within a window it is the one figure that
  // separates the same total earned over fewer papers from the same total
  // earned over more -- and the one earned over fewer is the better
  // performance. Accuracy and best then separate what is left.
  //
  // The three after that are not ranking criteria; they only make the order
  // stable, so a page reload cannot shuffle two rows that tie on all four.
  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints
    || b.avgScore - a.avgScore
    || (b.accuracyPct ?? -1) - (a.accuracyPct ?? -1)
    || b.bestScore - a.bestScore
    || a.cumulativeTimeSec - b.cumulativeTimeSec
    || a.firstAttemptDate.localeCompare(b.firstAttemptDate)
    || a.username.localeCompare(b.username),
  )

  // Standard competition ranking: genuinely tied rows share a rank.
  let rank = 0
  let lastKey = ''
  rows.forEach((row, i) => {
    // Exactly the four criteria that rank. Two rows that match on all of them
    // share the place; the ordering tail below them is only for stability.
    const key = `${row.totalPoints}|${row.avgScore}|${row.accuracyPct}|${row.bestScore}`
    if (key !== lastKey) { rank = i + 1; lastKey = key }
    row.rank = rank
  })

  return rows.map(({ cumulativeTimeSec: _t, firstAttemptDate: _d, ...row }) => row)
}

/**
 * Consecutive days attended: the current run, counting back from the most
 * recent day on the board, and the longest run ever. A day counts if the
 * student sat any paper that ran on it.
 *
 * Only days that actually held a paper are considered, so a night the admin
 * skipped never breaks anyone's streak (PRD section 11). A paper still open is
 * not on the board, so it cannot break one either.
 */
export function streaks(attended: Set<string>, dates: string[]): { current: number; longest: number } {
  let longest = 0
  let run = 0
  for (const d of dates) {
    run = attended.has(d) ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return { current: run, longest }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st — for "2nd of 5". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!)
}
