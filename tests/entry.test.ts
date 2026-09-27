import { describe, expect, it } from 'vitest'
import { entryRefusal, practiceRefusal } from '../app/test/start/entry'
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

describe('who may practise a paper (PRD 6.11)', () => {
  // A practice run is the archive made sittable, so it opens on exactly the
  // gate the archive opens on: you have finished it, or it has closed.
  it('lets somebody who has finished it practise while it is still open', () => {
    expect(practiceRefusal('SCHEDULED', W, true, at(22, 30))).toBeNull()
  })

  it('refuses somebody who has not, while they can still sit it for real', () => {
    // The whole point of the gate: this would be sitting the paper twice, the
    // second time knowing the questions, and the counted attempt is the one
    // that would be worth less for it.
    expect(practiceRefusal('SCHEDULED', W, false, at(22, 30)))
      .toMatch(/still sit this paper for real/)
  })

  it('refuses before it opens, when nobody has seen it', () => {
    expect(practiceRefusal('SCHEDULED', W, false, at(21, 0)))
      .toMatch(/has not closed yet/)
  })

  it('still refuses between entry closing and the paper closing', () => {
    // Entry shut at 23:15, but the last starter runs to midnight, so the
    // questions are not everybody's yet.
    expect(practiceRefusal('SCHEDULED', W, false, at(23, 30)))
      .toMatch(/has not closed yet/)
  })

  it('opens to everybody once the paper has closed', () => {
    expect(practiceRefusal('SCHEDULED', W, false, at(23, 59, 59))).not.toBeNull()
    expect(practiceRefusal('SCHEDULED', W, false, istInstant(D, 24, 0))).toBeNull()
  })

  it('opens the moment an admin ends it early', () => {
    const ended = { ...W, endedAt: istInstant(D, 21, 30).toISOString() }
    expect(practiceRefusal('SCHEDULED', ended, false, at(21, 29))).not.toBeNull()
    expect(practiceRefusal('SCHEDULED', ended, false, at(21, 31))).toBeNull()
  })

  it('refuses a draft, as everything else does', () => {
    expect(practiceRefusal('DRAFT', W, true, at(23, 59))).toBe('That paper is not scheduled.')
  })
})
