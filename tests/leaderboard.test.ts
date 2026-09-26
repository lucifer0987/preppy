import { describe, expect, it } from 'vitest'
import { buildLeaderboard, ordinal, paperRank, rankDelta, streaks, type AttemptRecord } from '../lib/leaderboard'

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
  it('breaks an equal total on accuracy', () => {
    const rows = buildLeaderboard([
      rec('sharp', DATES[0]!, 20, { correct: 20, attempted: 20 }),
      rec('broad', DATES[0]!, 20, { correct: 20, attempted: 40 }),
    ], DATES)
    expect(rows[0]!.username).toBe('sharp')
    expect(rows[0]!.accuracyPct).toBe(100)
    expect(rows[1]!.accuracyPct).toBe(50)
  })

  it('then on less time taken', () => {
    const rows = buildLeaderboard([
      rec('slow', DATES[0]!, 20, { timeSpentSec: 2700 }),
      rec('quick', DATES[0]!, 20, { timeSpentSec: 1800 }),
    ], DATES)
    expect(rows[0]!.username).toBe('quick')
  })

  it('then on who started earlier', () => {
    const rows = buildLeaderboard([
      rec('later', DATES[1]!, 20), rec('earlier', DATES[0]!, 20),
    ], DATES)
    expect(rows[0]!.username).toBe('earlier')
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
    expect(paperRank(records, 'a', DATES[0]!)).toEqual({ rank: 2, of: 4 })
    expect(paperRank(records, 'c', DATES[0]!)).toEqual({ rank: 2, of: 4 })
    expect(paperRank(records, 'd', DATES[0]!)).toEqual({ rank: 4, of: 4 })
    expect(paperRank(records, 'a', DATES[1]!)).toEqual({ rank: 1, of: 1 })
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
