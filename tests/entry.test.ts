import { describe, expect, it } from 'vitest'
import { entryRefusal } from '../app/test/start/entry'
import { istInstant } from '../lib/time'

const D = '2026-09-26'
const W = { date: D, opensAtMin: 22 * 60, entryClosesAtMin: 23 * 60 + 15, attemptMinutes: 45 }
const at = (hh: number, mm: number, ss = 0) => new Date(istInstant(D, hh, mm).getTime() + ss * 1000)

describe('who may begin tonight\'s paper (FR-4.1)', () => {
  it('lets a student in between 22:00 and 23:14:59', () => {
    expect(entryRefusal('SCHEDULED', W, at(22, 0))).toBeNull()
    expect(entryRefusal('SCHEDULED', W, at(23, 14, 59))).toBeNull()
  })

  it('refuses at 23:15:00 exactly, and says when entry closed', () => {
    expect(entryRefusal('SCHEDULED', W, at(23, 15))).toBe('Entry for this paper closed at 11:15 PM.')
  })

  it('says when it unlocks before 22:00', () => {
    expect(entryRefusal('SCHEDULED', W, at(21, 59))).toBe('This paper unlocks at 10:00 PM.')
  })

  it('names an early end rather than blaming the clock', () => {
    // The window still says entry runs to 23:15; the admin stopped it at 21:30.
    const ended = { ...W, endedAt: istInstant(D, 21, 30).toISOString() }
    expect(entryRefusal('SCHEDULED', ended, at(22, 30)))
      .toBe('This paper was ended early by your admin, so it can no longer be started.')
    // Before the stamp it is an ordinary open paper.
    expect(entryRefusal('SCHEDULED', ended, at(21, 0))).toBe('This paper unlocks at 10:00 PM.')
  })

  it('refuses a draft, and any other night\'s paper', () => {
    expect(entryRefusal('DRAFT', W, at(22, 30))).toMatch(/not scheduled/)
    expect(entryRefusal('SCHEDULED', { ...W, date: '2026-09-27' }, at(22, 30))).toMatch(/not today/)
  })
})
