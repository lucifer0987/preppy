import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ATTEMPT_MINUTES, paperWindowProblem } from '../lib/time'

const IST_OFFSET_MINUTES = 5 * 60 + 30
const DAY = 24 * 60
const vercel = JSON.parse(readFileSync(`${import.meta.dirname}/../vercel.json`, 'utf8'))

/** Minutes past IST midnight that a `m h * * *` expression fires. */
function istMinute(schedule: string): number {
  const [minute, hour, dom, month, dow] = schedule.split(' ')
  expect([dom, month, dow], schedule).toEqual(['*', '*', '*'])
  const m = Number(minute), h = Number(hour)
  expect(Number.isInteger(m) && Number.isInteger(h), schedule).toBe(true)
  return (h * 60 + m + IST_OFFSET_MINUTES) % DAY
}

/**
 * The schedule and the window rule have to agree, and they live in different
 * files -- one in vercel.json written in UTC, one in a CHECK constraint that
 * forces a paper to finish inside its own IST day. These tie them together, so
 * moving either without the other fails here rather than in production.
 */
describe('the finalise job', () => {
  const crons = vercel.crons as { path: string; schedule: string }[]

  it('is the only thing scheduled, and every run is the finalise one', () => {
    expect(crons.length).toBeGreaterThan(0)
    expect([...new Set(crons.map((c) => c.path))]).toEqual(['/api/cron/finalise'])
  })

  it('runs at 1 PM and 1 AM IST', () => {
    expect(crons.map((c) => istMinute(c.schedule)).sort((a, b) => a - b))
      .toEqual([1 * 60, 13 * 60])
  })

  it('leaves no more than twelve hours between sweeps', () => {
    // What the second run buys: a morning paper abandoned at 07:45 is scored
    // that afternoon rather than sitting off the leaderboard until the small
    // hours. The gap wraps around midnight, so the last run pairs with the first.
    const times = crons.map((c) => istMinute(c.schedule)).sort((a, b) => a - b)
    const gaps = times.map((t, i) => (i === 0 ? times[0]! + DAY - times[times.length - 1]! : t - times[i - 1]!))
    expect(Math.max(...gaps)).toBeLessThanOrEqual(12 * 60)
  })

  it('sweeps in the small hours, when almost every paper is behind it', () => {
    const afterMidnight = crons.map((c) => istMinute(c.schedule)).filter((t) => t > 0 && t < 6 * 60)
    expect(afterMidnight.length).toBeGreaterThan(0)
  })

  /**
   * The window is the admin's to choose (0010), so a paper may still be
   * running when a sweep fires -- entry closing at 23:45 on a 45-minute paper
   * finishes at 00:30, after the 1 AM run has been and gone for the papers
   * before it.
   *
   * That is not a hole. finaliseOverdueAttempts scores anything past its hard
   * stop whenever it runs, the second sweep is twelve hours later, the admin
   * has a button, and reading a result finalises it. The sweep is a backstop
   * with several other backstops behind it, which is why widening the window
   * did not need it rescheduled.
   */
  it('no longer assumes a paper ends inside its own day', () => {
    for (const len of [20, DEFAULT_ATTEMPT_MINUTES, 90, 180, 8 * 60]) {
      // Entry closing one minute before midnight, whatever the paper's length.
      expect(paperWindowProblem({ opensAtMin: 0, entryClosesAtMin: DAY - 1, attemptMinutes: len }))
        .toBeNull()
    }
  })

  it('still runs twice, so nothing waits a full day to be scored', () => {
    expect(crons).toHaveLength(2)
    const apart = Math.abs(istMinute(crons[0]!.schedule) - istMinute(crons[1]!.schedule))
    expect(Math.min(apart, DAY - apart)).toBe(12 * 60)
  })
})
