import { describe, expect, it } from 'vitest'
import { buildLeaderboard, ordinal, paperRank, rankDelta, streaks, type AttemptRecord, percentileOf, PERCENTILE_MIN_COHORT } from '../lib/leaderboard'

const rec = (
  user: string, paperKey: string, totalScore: number,
  extra: Partial<AttemptRecord> = {},
): AttemptRecord => ({
  userId: user, displayName: user, username: user, paperKey, totalScore,
  correct: extra.correct ?? 10, attempted: extra.attempted ?? 10,
  timeSpentSec: extra.timeSpentSec ?? 2700,
})

const DATES = ['2026-09-01', '2026-09-02', '2026-09-03']

describe('ranking on cumulative total (FR-6.7.1)', () => {
  it('orders by points summed across every paper', () => {
    const rows = buildLeaderboard(
      [rec('aarav', DATES[0]!, 30), rec('aarav', DATES[1]!, 30),
       rec('priya', DATES[0]!, 50), rec('rohit', DATES[0]!, 10)],
      DATES,
    )
    expect(rows.map((r) => r.username)).toEqual(['aarav', 'priya', 'rohit'])
    expect(rows[0]!.totalPoints).toBe(60)
    expect(rows[0]!.rank).toBe(1)
  })

  it('counts someone who has taken fewer papers honestly', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 40), rec('b', DATES[0]!, 20), rec('b', DATES[1]!, 20)], DATES)
    expect(rows[0]!.testsTaken).toBe(1)
    expect(rows[1]!.testsTaken).toBe(2)
    // Equal totals, so the tie-break decides; both are visible either way.
    expect(rows[0]!.totalPoints).toBe(rows[1]!.totalPoints)
  })

  it('handles a negative cumulative total without hiding it', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, -3.25), rec('b', DATES[0]!, 1)], DATES)
    expect(rows[1]!.totalPoints).toBe(-3.25)
  })

  it('returns an empty board when nobody has attempted anything', () => {
    expect(buildLeaderboard([], DATES)).toEqual([])
  })
})

describe('tie-breaks, in order (FR-6.7.2)', () => {
  it('breaks an equal total on the average first', () => {
    // Same 20 points: one earned it over a single paper, the other needed two.
    // Fewer papers for the same total is the better performance.
    const rows = buildLeaderboard([
      rec('dense', DATES[0]!, 20),
      rec('spread', DATES[0]!, 10), rec('spread', DATES[1]!, 10),
    ], DATES)
    expect(rows[0]!.username).toBe('dense')
    expect(rows[0]!.avgScore).toBe(20)
    expect(rows[1]!.avgScore).toBe(10)
  })

  it('then on accuracy', () => {
    const rows = buildLeaderboard([
      rec('sharp', DATES[0]!, 20, { correct: 20, attempted: 20 }),
      rec('broad', DATES[0]!, 20, { correct: 20, attempted: 40 }),
    ], DATES)
    expect(rows[0]!.username).toBe('sharp')
    expect(rows[0]!.accuracyPct).toBe(100)
    expect(rows[1]!.accuracyPct).toBe(50)
  })

  it('then on the best single paper in the window', () => {
    // Identical total, average and accuracy across two papers; one of them
    // put up a better single score.
    const rows = buildLeaderboard([
      rec('peaky', DATES[0]!, 30), rec('peaky', DATES[1]!, 10),
      rec('even', DATES[0]!, 20), rec('even', DATES[1]!, 20),
    ], DATES)
    expect(rows[0]!.username).toBe('peaky')
    expect(rows[0]!.bestScore).toBe(30)
    expect(rows[1]!.bestScore).toBe(20)
  })

  it('measures that best inside the window, not all time', () => {
    const rows = buildLeaderboard([
      rec('a', DATES[0]!, 50), rec('a', DATES[1]!, 5), rec('a', DATES[2]!, 5),
    ], DATES, { lastN: 2 })
    // The 50 is outside the last two papers, so it is not their best.
    expect(rows[0]!.bestScore).toBe(5)
  })

  it('orders what is left stably, without calling it a rank', () => {
    // Equal on all four criteria: less time first, then who started earlier.
    const quick = buildLeaderboard([
      rec('slow', DATES[0]!, 20, { timeSpentSec: 2700 }),
      rec('quick', DATES[0]!, 20, { timeSpentSec: 1800 }),
    ], DATES)
    expect(quick[0]!.username).toBe('quick')
    expect(quick[0]!.rank).toBe(1)
    expect(quick[1]!.rank).toBe(1)

    const early = buildLeaderboard([
      rec('later', DATES[1]!, 20), rec('earlier', DATES[0]!, 20),
    ], DATES)
    expect(early[0]!.username).toBe('earlier')
  })

  it('gives genuinely tied rows the same rank', () => {
    const rows = buildLeaderboard([
      { ...rec('a', DATES[0]!, 20), username: 'a', userId: 'a' },
      { ...rec('b', DATES[0]!, 20), username: 'b', userId: 'b' },
      rec('c', DATES[0]!, 5),
    ], DATES)
    expect(rows[0]!.rank).toBe(1)
    expect(rows[1]!.rank).toBe(1)
    expect(rows[2]!.rank).toBe(3)
  })
})

describe('streaks', () => {
  it('counts consecutive papers back from the latest', () => {
    const rows = buildLeaderboard(DATES.map((d) => rec('a', d, 10)), DATES)
    expect(rows[0]!.currentStreak).toBe(3)
  })

  it('breaks on a paper that ran and was missed', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 10), rec('a', DATES[2]!, 10)], DATES)
    expect(rows[0]!.currentStreak).toBe(1)
  })

  it('is zero for someone who missed the most recent paper', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 10), rec('a', DATES[1]!, 10)], DATES)
    expect(rows[0]!.currentStreak).toBe(0)
  })

  it('is not broken by a night the admin skipped', () => {
    // Only two papers ever ran, with a gap in the calendar between them.
    const sparse = ['2026-09-01', '2026-09-05']
    const rows = buildLeaderboard(sparse.map((d) => rec('a', d, 10)), sparse)
    expect(rows[0]!.currentStreak).toBe(2)
  })
})

describe('streaks when a day holds more than one paper', () => {
  // Keys are YYYY-MM-DD#MMMM: 0360 is a 06:00 paper, 1320 a 22:00 one.
  const MORNING = ['2026-09-01#0360', '2026-09-02#0360', '2026-09-03#0360']
  const EVENING = ['2026-09-01#1320', '2026-09-02#1320', '2026-09-03#1320']
  const BOTH = [...MORNING, ...EVENING].sort()

  it('counts papers, so sitting both on a day is worth two', () => {
    const rows = buildLeaderboard(BOTH.map((k) => rec('a', k, 10)), BOTH)
    expect(rows[0]!.currentStreak).toBe(6)
    expect(rows[0]!.longestStreak).toBe(6)
  })

  it('breaks on a paper that ran and was skipped, even on a day they turned up', () => {
    // Sitting only the evening paper is a miss every morning. Counting days
    // hid that; the unit the product is about is the paper.
    const rows = buildLeaderboard(EVENING.map((k) => rec('a', k, 10)), BOTH)
    expect(rows[0]!.currentStreak).toBe(1)
    expect(rows[0]!.longestStreak).toBe(1)
  })

  it('runs through a day where both were sat', () => {
    // Missed only the very first paper, so everything after it is one run.
    const rows = buildLeaderboard(BOTH.slice(1).map((k) => rec('a', k, 10)), BOTH)
    expect(rows[0]!.currentStreak).toBe(5)
  })
})

describe('streaks under a window', () => {
  const many = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)

  it('counts every paper, not just the ones inside Last N', () => {
    const rows = buildLeaderboard(many.map((d) => rec('a', d, 10)), many, { lastN: 7 })
    expect(rows[0]!.testsTaken).toBe(7)
    expect(rows[0]!.currentStreak).toBe(12)
  })
})

describe('longest streak (PRD 6.8)', () => {
  it('remembers the longest run even after it broke', () => {
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    const rows = buildLeaderboard(
      [rec('a', dates[0]!, 1), rec('a', dates[1]!, 1), rec('a', dates[2]!, 1), rec('a', dates[4]!, 1)],
      dates,
    )
    expect(rows[0]!.currentStreak).toBe(1)
    expect(rows[0]!.longestStreak).toBe(3)
  })

  it('is zero for nobody on the board, and matches a streak never broken', () => {
    expect(streaks(new Set(), DATES)).toEqual({ current: 0, longest: 0 })
    expect(streaks(new Set(DATES), DATES)).toEqual({ current: 3, longest: 3 })
  })
})

describe('movement under a window', () => {
  it('compares Last N with the same window one paper earlier', () => {
    // Four papers, Last 2. Before the latest paper the window was papers 2-3,
    // where b led; now it is papers 3-4, where a leads.
    const d = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
    const rows = buildLeaderboard([
      rec('a', d[0]!, 50), rec('b', d[1]!, 30), rec('a', d[2]!, 1), rec('b', d[2]!, 2), rec('a', d[3]!, 40),
    ], d, { lastN: 2 })
    const a = rows.find((r) => r.username === 'a')!
    expect(a.rank).toBe(1)
    expect(a.movement).toBe(1) // from 2nd in papers 2-3 to 1st in papers 3-4
  })
})

describe('the result page figures (PRD 6.6)', () => {
  it('ranks one paper on its score alone, ties sharing a place', () => {
    const records = [
      rec('a', DATES[0]!, 30), rec('b', DATES[0]!, 40), rec('c', DATES[0]!, 30),
      rec('d', DATES[0]!, 10), rec('a', DATES[1]!, 50),
    ]
    expect(paperRank(records, 'a', DATES[0]!)).toEqual({ rank: 2, of: 4, percentile: null })
    expect(paperRank(records, 'c', DATES[0]!)).toEqual({ rank: 2, of: 4, percentile: null })
    expect(paperRank(records, 'd', DATES[0]!)).toEqual({ rank: 4, of: 4, percentile: null })
    expect(paperRank(records, 'a', DATES[1]!)).toEqual({ rank: 1, of: 1, percentile: null })
  })

  it('is null for a paper the student has no counted attempt on', () => {
    expect(paperRank([rec('a', DATES[0]!, 30)], 'b', DATES[0]!)).toBeNull()
  })

  it('reports the all-time rank before and after a paper', () => {
    const records = [
      rec('a', DATES[0]!, 10), rec('b', DATES[0]!, 30),
      rec('a', DATES[1]!, 40), rec('b', DATES[1]!, 5),
      // A later paper must not change what the earlier result says.
      rec('b', DATES[2]!, 55),
    ]
    expect(rankDelta(records, 'a', DATES[1]!)).toEqual({ before: 2, after: 1, of: 2 })
  })

  it('has no "before" on a first paper', () => {
    const records = [rec('a', DATES[0]!, 10), rec('b', DATES[1]!, 30)]
    expect(rankDelta(records, 'b', DATES[1]!)).toEqual({ before: null, after: 1, of: 2 })
  })

  it('writes ordinals the way people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th'])
  })
})

describe('movement since the last paper', () => {
  it('reports positions gained', () => {
    const rows = buildLeaderboard([
      rec('a', DATES[0]!, 10), rec('b', DATES[0]!, 50),
      rec('a', DATES[1]!, 50), rec('b', DATES[1]!, 1),
    ], DATES.slice(0, 2))
    const a = rows.find((r) => r.username === 'a')!
    expect(a.rank).toBe(1)
    expect(a.movement).toBe(1) // was 2nd, now 1st
    expect(rows.find((r) => r.username === 'b')!.movement).toBe(-1)
  })

  it('reports null for someone who has only just joined', () => {
    const rows = buildLeaderboard([
      rec('old', DATES[0]!, 10), rec('old', DATES[1]!, 10), rec('newbie', DATES[1]!, 40),
    ], DATES.slice(0, 2))
    expect(rows.find((r) => r.username === 'newbie')!.movement).toBeNull()
    expect(rows.find((r) => r.username === 'old')!.movement).toBe(-1)
  })

  it('reports null for everyone when only one paper has run', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 10)], [DATES[0]!])
    expect(rows[0]!.movement).toBeNull()
  })
})

describe('the Last-30 filter (FR-6.7.5)', () => {
  const many = Array.from({ length: 40 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)

  it('counts only papers inside the window', () => {
    const records = [
      ...many.slice(0, 10).map((d) => rec('veteran', d, 30)),
      ...many.slice(-5).map((d) => rec('joiner', d, 30)),
    ]
    const all = buildLeaderboard(records, many)
    expect(all.find((r) => r.username === 'veteran')!.rank).toBe(1)

    // Restricted to the last 30 papers, the veteran's early run does not count.
    const recent = buildLeaderboard(records, many, { lastN: 30 })
    expect(recent.find((r) => r.username === 'joiner')!.rank).toBe(1)
    expect(recent.find((r) => r.username === 'veteran')).toBeUndefined()
  })

  it('leaves a shorter history untouched', () => {
    const rows = buildLeaderboard(DATES.map((d) => rec('a', d, 10)), DATES, { lastN: 30 })
    expect(rows[0]!.testsTaken).toBe(3)
  })

  it('counts the last seven papers on the system, not the last seven you sat', () => {
    // `keen` sat every paper; `sporadic` sat only the three oldest. The window
    // is the last seven papers that ran, so `sporadic` falls out of it
    // entirely rather than carrying three old papers into the recent view.
    const records = [
      ...many.slice(0, 10).map((d) => rec('keen', d, 10)),
      ...many.slice(0, 3).map((d) => rec('sporadic', d, 40)),
    ]
    const rows = buildLeaderboard(records, many.slice(0, 10), { lastN: 7 })
    expect(rows.map((r) => r.username)).toEqual(['keen'])
    expect(rows[0]!.testsTaken).toBe(7)
  })
})

describe('derived figures', () => {
  it('averages over papers taken, not papers that ran', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 30), rec('a', DATES[1]!, 20)], DATES)
    expect(rows[0]!.avgScore).toBe(25)
  })

  it('takes accuracy across every counted attempt, not per paper', () => {
    const rows = buildLeaderboard([
      rec('a', DATES[0]!, 10, { correct: 3, attempted: 4 }),
      rec('a', DATES[1]!, 10, { correct: 1, attempted: 4 }),
    ], DATES)
    expect(rows[0]!.accuracyPct).toBe(50) // 4 of 8
  })

  it('reports the single best paper', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 12), rec('a', DATES[1]!, 41.25)], DATES)
    expect(rows[0]!.bestScore).toBe(41.25)
  })

  it('leaves accuracy null when nothing was ever attempted', () => {
    const rows = buildLeaderboard([rec('a', DATES[0]!, 0, { correct: 0, attempted: 0 })], DATES)
    expect(rows[0]!.accuracyPct).toBeNull()
  })
})

describe('a paper still open, counted from the moment somebody finishes it', () => {
  // The first two papers have closed; the third is running, and only `a` has
  // handed it in. It is on the board -- that is the point -- but it must not
  // yet be a day `b` has missed.
  const closed = [DATES[0]!, DATES[1]!]
  const all = [DATES[0]!, DATES[1]!, DATES[2]!]
  const records = [
    rec('a', DATES[0]!, 10), rec('b', DATES[0]!, 10),
    rec('a', DATES[1]!, 10), rec('b', DATES[1]!, 10),
    rec('a', DATES[2]!, 10),
  ]

  it('scores the open paper for whoever has finished it', () => {
    const rows = buildLeaderboard(records, all, { streakKeys: closed })
    expect(rows.find((r) => r.userId === 'a')!.totalPoints).toBe(30)
    expect(rows.find((r) => r.userId === 'b')!.totalPoints).toBe(20)
    expect(rows[0]!.userId).toBe('a')
  })

  it('counts it for whoever has sat it, and leaves the rest alone', () => {
    const rows = buildLeaderboard(records, all, { streakKeys: closed })
    // `a` handed it in, so it settled for them and the run is three.
    expect(rows.find((r) => r.userId === 'a')!.currentStreak).toBe(3)
    // `b` can still sit it, so it is not in their run at all. Counting it
    // would break a two-paper run on a paper they have not missed yet, and
    // heal it again an hour later.
    expect(rows.find((r) => r.userId === 'b')!.currentStreak).toBe(2)
  })

  it('counts the miss once the paper settles for everybody', () => {
    const rows = buildLeaderboard(records, all, { streakKeys: all })
    expect(rows.find((r) => r.userId === 'b')!.currentStreak).toBe(0)
    expect(rows.find((r) => r.userId === 'a')!.currentStreak).toBe(3)
  })

  it('falls back to the board when no streak scope is given', () => {
    const rows = buildLeaderboard(records, all)
    expect(rows.find((r) => r.userId === 'b')!.currentStreak).toBe(0)
  })
})

describe('percentiles, once there is a cohort to have one (PRD 6.7.10)', () => {
  // With five students the only percentiles available are 0, 20, 40, 60 and
  // 80, each moving twenty points when one person has an off day. That is a
  // coarser measure than "2nd of 5" wearing a decimal point, so below the
  // threshold there is no percentile at all.
  const cohort = (n: number) => Array.from({ length: n }, (_, i) => i)

  it('is null for a board no bigger than the threshold', () => {
    expect(percentileOf(5, cohort(5))).toBeNull()
    expect(percentileOf(5, cohort(PERCENTILE_MIN_COHORT))).toBeNull()
  })

  it('appears the moment the board is bigger than it', () => {
    expect(percentileOf(0, cohort(PERCENTILE_MIN_COHORT + 1))).toBe(0)
  })

  it('counts the share scoring strictly below, as the exam does', () => {
    // 40 people, scores 0..39. Scoring 30 beats thirty of them.
    expect(percentileOf(30, cohort(40))).toBe(75)
    expect(percentileOf(20, cohort(40))).toBe(50)
  })

  it('never reaches 100, because the top of the board cannot beat itself', () => {
    expect(percentileOf(39, cohort(40))).toBe(97.5)
  })

  it('gives a tie one percentile, as it gives them one rank', () => {
    const tied = [...cohort(38), 50, 50]
    expect(percentileOf(50, tied)).toBe(percentileOf(50, tied))
    expect(percentileOf(50, tied)).toBe(95)
  })

  it('reaches the board rows, and only above the threshold', () => {
    const small = buildLeaderboard(
      [rec('a', DATES[0]!, 10), rec('b', DATES[0]!, 20)], [DATES[0]!])
    expect(small.every((r) => r.percentile === null)).toBe(true)

    const many = Array.from({ length: 40 }, (_, i) => rec(`u${i}`, DATES[0]!, i))
    const big = buildLeaderboard(many, [DATES[0]!])
    expect(big[0]!.percentile).toBe(97.5)
    expect(big.at(-1)!.percentile).toBe(0)
  })
})
