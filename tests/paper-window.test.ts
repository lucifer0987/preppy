import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../lib/supabase/admin', () => ({ db: () => { throw new Error('not used') } }))

const { PAPER_WINDOW_COLUMNS, paperWindowOf, shapeOf } = await import('../lib/repo/papers')

describe('building a window from a row', () => {
  it('reads the window columns', () => {
    expect(paperWindowOf({
      date: '2026-11-01', opens_at_min: 360, entry_closes_at_min: 420, attempt_sec: 45 * 60,
      ended_at: null,
    })).toEqual({
      date: '2026-11-01', opensAtMin: 360, entryClosesAtMin: 420, attemptMinutes: 45, endedAt: null,
    })
  })

  it('carries an early end through', () => {
    expect(paperWindowOf({
      date: '2026-11-01', opens_at_min: 360, entry_closes_at_min: 420, attempt_sec: 45 * 60,
      ended_at: '2026-11-01T05:00:00Z',
    }).endedAt).toBe('2026-11-01T05:00:00Z')
  })

  it('refuses a row whose select forgot ended_at', () => {
    // Absent reads exactly like "never ended", so a paper an admin had ended
    // would look to that caller like one still running.
    expect(() => paperWindowOf({
      date: '2026-11-01', opens_at_min: 360, entry_closes_at_min: 420, attempt_sec: 45 * 60,
    })).toThrow(/ended_at/)
  })

  it('refuses a row whose select forgot the window columns', () => {
    // The failure this replaces was silent: an undefined window made every
    // check answer "no", so the briefing page hid Begin from every student and
    // the paper looked like one that never opens.
    expect(() => paperWindowOf({ date: '2026-11-01' })).toThrow(/window columns/)
    expect(() => paperWindowOf({ date: '2026-11-01', opens_at_min: 360 })).toThrow(/window columns/)
    // Including the one added last: a paper read without its length would get
    // a hard stop of Invalid Date, and every section deadline would be NaN.
    expect(() => paperWindowOf({
      date: '2026-11-01', opens_at_min: 360, entry_closes_at_min: 420,
    })).toThrow(/window columns/)
  })

  it('names the columns a select needs', () => {
    for (const c of ['date', 'opens_at_min', 'entry_closes_at_min', 'attempt_sec', 'ended_at']) {
      expect(PAPER_WINDOW_COLUMNS).toContain(c)
    }
  })
})

describe('the shape a paper carries', () => {
  const w = { date: '2026-11-01', opensAtMin: 1320, entryClosesAtMin: 1395, attemptMinutes: 45 }
  const sec = (question_count: number, marks_correct: number, marks_negative: number) =>
    ({ question_count, marks_correct, marks_negative })

  it('adds up the questions and takes the minutes from the window', () => {
    const s = shapeOf([sec(15, 1, 0.25), sec(15, 1, 0.25), sec(10, 1, 0.25), sec(15, 1, 0.25)], w)
    expect([s.questions, s.minutes]).toEqual([55, 45])
    expect(s.marking).toEqual({ correct: 1, negative: 0.25 })
  })

  it('says nothing about marking when the sections disagree', () => {
    const s = shapeOf([sec(10, 1, 0.25), sec(10, 2, 0.5)], w)
    expect(s.marking).toBeNull()
    expect(s.questions).toBe(20)
  })

  it('treats numeric strings from the database as the numbers they are', () => {
    // Postgres numeric(4,2) arrives as a string through PostgREST, so "1.00"
    // and 1 must not read as two different marking schemes.
    const s = shapeOf(
      [{ question_count: 10, marks_correct: '1.00', marks_negative: '0.25' }, sec(10, 1, 0.25)], w)
    expect(s.marking).toEqual({ correct: 1, negative: 0.25 })
  })

  it('has nothing to say about a paper with no sections', () => {
    const s = shapeOf([], w)
    expect([s.questions, s.minutes, s.marking]).toEqual([0, 45, null])
  })
})
