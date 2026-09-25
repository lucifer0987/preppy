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
  testDate: string
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
}

export interface LeaderboardOptions {
  /** Restrict to the most recent N papers. Omit for all time. */
  lastN?: number
}

/**
 * @param records   one row per counted attempt. Dry runs must already be
 *                  excluded, which excludes the admin by construction (FR-5.2).
 * @param testDates every paper that has run, ascending. Needed for streaks:
 *                  a night with no paper must not break one.
 */
export function buildLeaderboard(
  records: AttemptRecord[],
  testDates: string[],
  options: LeaderboardOptions = {},
): LeaderboardRow[] {
  const dates = [...new Set(testDates)].sort()
  const inScope = options.lastN ? dates.slice(-options.lastN) : dates
  const scoped = records.filter((r) => inScope.includes(r.testDate))

  const current = aggregate(scoped, inScope)

  // Movement compares against the board as it stood before the latest paper.
  const previousDates = inScope.slice(0, -1)
  const previous = previousDates.length
    ? aggregate(records.filter((r) => previousDates.includes(r.testDate)), previousDates)
    : []
  const previousRank = new Map(previous.map((r) => [r.userId, r.rank]))

  return current.map((row) => ({
    ...row,
    movement: previousRank.has(row.userId) ? previousRank.get(row.userId)! - row.rank : null,
  }))
}

function aggregate(records: AttemptRecord[], dates: string[]): Omit<LeaderboardRow, 'movement'>[] {
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
    const first = attempts.reduce((a, r) => (r.testDate < a ? r.testDate : a), attempts[0]!.testDate)

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
      currentStreak: streak(new Set(attempts.map((r) => r.testDate)), dates),
      cumulativeTimeSec: attempts.reduce((a, r) => a + r.timeSpentSec, 0),
      firstAttemptDate: first,
    }
  })

  // FR-6.7.2: total, then accuracy, then less time taken, then who started earlier.
  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints
    || (b.accuracyPct ?? -1) - (a.accuracyPct ?? -1)
    || a.cumulativeTimeSec - b.cumulativeTimeSec
    || a.firstAttemptDate.localeCompare(b.firstAttemptDate)
    || a.username.localeCompare(b.username),
  )

  // Standard competition ranking: genuinely tied rows share a rank.
  let rank = 0
  let lastKey = ''
  rows.forEach((row, i) => {
    const key = `${row.totalPoints}|${row.accuracyPct}|${row.cumulativeTimeSec}|${row.firstAttemptDate}`
    if (key !== lastKey) { rank = i + 1; lastKey = key }
    row.rank = rank
  })

  return rows.map(({ cumulativeTimeSec: _t, firstAttemptDate: _d, ...row }) => row)
}

/**
 * Consecutive papers attempted, counting back from the most recent one.
 *
 * Only papers that actually ran are considered, so a night the admin skipped
 * never breaks anyone's streak (PRD section 11).
 */
function streak(attemptedDates: Set<string>, dates: string[]): number {
  let count = 0
  for (let i = dates.length - 1; i >= 0; i--) {
    if (attemptedDates.has(dates[i]!)) count++
    else break
  }
  return count
}

const round2 = (n: number) => Math.round(n * 100) / 100
