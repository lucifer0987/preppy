import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ATTEMPT_MINUTES, paperWindowProblem } from '../lib/time'

const IST_OFFSET_MINUTES = 5 * 60 + 30
const vercel = JSON.parse(readFileSync(`${import.meta.dirname}/../vercel.json`, 'utf8'))

/**
 * The schedule and the window rule have to agree, and they live in different
 * files -- one in vercel.json written in UTC, one in the CHECK constraint that
 * forces a paper to finish inside its own IST day. These tie them together, so
 * moving either one without the other fails here rather than in production.
 */
describe('the nightly finalise job', () => {
  it('is the only scheduled job, and it is the finalise one', () => {
    expect(vercel.crons).toHaveLength(1)
    expect(vercel.crons[0].path).toBe('/api/cron/finalise')
  })

  it('runs once a day, at a fixed time', () => {
    const [minute, hour, dom, month, dow] = vercel.crons[0].schedule.split(' ')
    expect([dom, month, dow]).toEqual(['*', '*', '*'])
    expect(Number(minute)).not.toBeNaN()
    expect(Number(hour)).not.toBeNaN()
  })

  it('fires at 01:00 IST', () => {
    const [minute, hour] = vercel.crons[0].schedule.split(' ').map(Number)
    const ist = (hour! * 60 + minute! + IST_OFFSET_MINUTES) % (24 * 60)
    expect(ist).toBe(60)
  })

  it('fires after the last moment a paper from the day before can still be running', () => {
    // A paper must let its last entrant finish before midnight, so the latest
    // hard stop any paper can have is midnight exactly.
    const latestEntryClose = 24 * 60 - DEFAULT_ATTEMPT_MINUTES
    expect(paperWindowProblem({ opensAtMin: 0, entryClosesAtMin: latestEntryClose, attemptMinutes: DEFAULT_ATTEMPT_MINUTES })).toBeNull()
    expect(paperWindowProblem({ opensAtMin: 0, entryClosesAtMin: latestEntryClose + 1, attemptMinutes: DEFAULT_ATTEMPT_MINUTES })).not.toBeNull()
    expect(latestEntryClose + DEFAULT_ATTEMPT_MINUTES).toBe(24 * 60)

    // And it is not a fact about 45 minutes: whatever a paper's length, the rule
    // forces its hard stop to land on or before midnight, so a job after
    // midnight is after every paper dated the day before.
    for (const len of [20, 45, 90, 180, 8 * 60]) {
      const latest = 24 * 60 - len
      expect(paperWindowProblem({ opensAtMin: 0, entryClosesAtMin: latest, attemptMinutes: len })).toBeNull()
      expect(paperWindowProblem({ opensAtMin: 0, entryClosesAtMin: latest + 1, attemptMinutes: len })).not.toBeNull()
      expect(latest + len).toBe(24 * 60)
    }

    // The job runs after that, on the next IST day.
    const [minute, hour] = vercel.crons[0].schedule.split(' ').map(Number)
    const ist = (hour! * 60 + minute! + IST_OFFSET_MINUTES) % (24 * 60)
    expect(ist).toBeGreaterThan(0)
    expect(ist).toBeLessThan(6 * 60) // ...and still in the small hours, before anyone sits a paper
  })
})
