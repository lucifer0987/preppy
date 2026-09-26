import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../lib/supabase/admin', () => ({ db: () => { throw new Error('not used') } }))

const { PAPER_WINDOW_COLUMNS, paperWindowOf } = await import('../lib/repo/papers')

describe('building a window from a row', () => {
  it('reads the three columns', () => {
    expect(paperWindowOf({ date: '2026-11-01', opens_at_min: 360, entry_closes_at_min: 420 }))
      .toEqual({ date: '2026-11-01', opensAtMin: 360, entryClosesAtMin: 420 })
  })

  it('refuses a row whose select forgot the window columns', () => {
    // The failure this replaces was silent: an undefined window made every
    // check answer "no", so the briefing page hid Begin from every student and
    // the paper looked like one that never opens.
    expect(() => paperWindowOf({ date: '2026-11-01' })).toThrow(/window columns/)
    expect(() => paperWindowOf({ date: '2026-11-01', opens_at_min: 360 })).toThrow(/window columns/)
  })

  it('names the columns a select needs', () => {
    for (const c of ['date', 'opens_at_min', 'entry_closes_at_min']) {
      expect(PAPER_WINDOW_COLUMNS).toContain(c)
    }
  })
})
