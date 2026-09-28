import { describe, expect, it } from 'vitest'
import {
  SCHEDULE, SCHEDULE_DAYS, SCHEDULE_FIRST, SCHEDULE_LAST,
  nextScheduleDay, scheduleDayOn, schedulePatterns, sectionOf,
} from '../lib/schedule'
import { anchorOf } from '../components/ScheduleTable'
import { addDays } from '../lib/time'

/**
 * The timetable is transcribed from a PDF, which is the one thing about it
 * worth testing: a transcription is where a day goes missing, a date slips a
 * weekday, or a week claims a range it does not hold. None of that would throw
 * at runtime -- it would just quietly show the wrong topic beside a date, which
 * is the only thing this page is for.
 */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

describe('the timetable', () => {
  it('runs eighty-four days without a gap', () => {
    expect(SCHEDULE_DAYS).toHaveLength(84)
    expect(SCHEDULE_DAYS.map((d) => d.day)).toEqual(
      Array.from({ length: 84 }, (_, i) => i + 1))
  })

  it('starts the Monday the series starts and ends on exam day', () => {
    expect(SCHEDULE_FIRST).toBe('2026-09-28')
    expect(SCHEDULE_LAST).toBe('2026-12-20')
    expect(SCHEDULE_DAYS[83]!.test).toBe('EXAM')
  })

  it('gives every day the date that follows the one before it', () => {
    for (const [i, d] of SCHEDULE_DAYS.entries()) {
      expect(d.date, `day ${d.day}`).toBe(addDays(SCHEDULE_FIRST, i))
    }
  })

  /**
   * The printed label is what a reader actually checks against their own
   * calendar, so it has to agree with the ISO date rather than merely look
   * plausible. "Sun 04 Oct" on a Saturday is the failure this catches.
   */
  it('writes each date the way the calendar has it', () => {
    for (const d of SCHEDULE_DAYS) {
      // Spelled out rather than taken from toLocaleDateString, which renders
      // September as "Sept" and puts a comma after the weekday -- so a test
      // built on it would be checking the runtime's ICU data, not the plan.
      const t = new Date(`${d.date}T00:00:00Z`)
      const printed = `${DOW[t.getUTCDay()]} ${String(t.getUTCDate()).padStart(2, '0')} ${MON[t.getUTCMonth()]}`
      expect(printed, `day ${d.day}`).toBe(d.label)
    }
  })

  it('has every day inside a section that claims it', () => {
    let next = 1
    for (const s of SCHEDULE) {
      expect(s.from, s.name).toBe(next)
      expect(s.days[0]!.day, s.name).toBe(s.from)
      expect(s.days[s.days.length - 1]!.day, s.name).toBe(s.to)
      expect(s.days).toHaveLength(s.to - s.from + 1)
      next = s.to + 1
    }
    expect(next).toBe(85)
  })

  it('says what each day is', () => {
    for (const d of SCHEDULE_DAYS) {
      expect(d.test.length, `day ${d.day}`).toBeGreaterThan(0)
      // Either a topic or the plan that stands in for one on a test, mock or
      // review day. A row with neither renders an empty PK cell.
      expect(Boolean(d.pk.topic || d.pk.plan), `day ${d.day}`).toBe(true)
    }
  })

  /**
   * The table spans the PK cell across the three QRE columns when they are
   * empty, so "some but not all" would render a row with holes in it. The plan
   * never does that; this is what stops an edit from starting.
   */
  it('gives a day either all three QRE columns or none', () => {
    for (const d of SCHEDULE_DAYS) {
      const filled = [d.quant, d.reasoning, d.english].filter(Boolean).length
      expect(filled, `day ${d.day}`).toBeOneOf([0, 3])
    }
  })

  /**
   * A mock day's PK cell pairs a count with a subject -- "DBMS 5
   * (Transactions)". The two are set differently in the PDF, so an extractor
   * that partitioned by weight would produce all the counts and then all the
   * subjects, which reads as two unrelated lists. Every pairing is here.
   */
  it('keeps each mock count next to the subject it counts', () => {
    const mocks = SCHEDULE_DAYS.filter((d) => d.test.startsWith('Full Mock'))
    expect(mocks).toHaveLength(15)
    for (const d of mocks) {
      const plan = d.pk.plan ?? ''
      expect(plan, d.test).toMatch(/^[A-Za-z].*\(/)
      // Every count is followed by its subject, never by another count.
      expect(plan, d.test).not.toMatch(/\d+ [A-Z][\w/+]* \d/)
      const counts = plan.split(' · ').length
      expect(plan.match(/\(/g) ?? [], d.test).toHaveLength(counts)
    }
  })

  it('counts the patterns it uses rather than being told them', () => {
    const patterns = schedulePatterns()
    expect(patterns.map((p) => p.pattern)).toEqual([
      'Pattern A · 55 Q · 45 min', 'Pattern B · 160 Q · 120 min',
    ])
    // Every counted day is a real day, and the count is the whole of them.
    const counted = patterns.reduce((n, p) => n + p.days, 0)
    expect(counted).toBe(SCHEDULE_DAYS.filter((d) => d.pattern?.startsWith('Pattern ')).length)
  })

  it('finds a day by its date, and nothing on a date outside the plan', () => {
    expect(scheduleDayOn('2026-09-28')?.day).toBe(1)
    expect(scheduleDayOn('2026-12-20')?.day).toBe(84)
    expect(scheduleDayOn('2026-09-27')).toBeNull()
    expect(scheduleDayOn('2026-12-21')).toBeNull()
  })

  it('points at the next day from before, during and after the plan', () => {
    expect(nextScheduleDay('2026-01-01')?.day).toBe(1)
    expect(nextScheduleDay('2026-09-28')?.day).toBe(1)
    expect(nextScheduleDay('2026-12-20')?.day).toBe(84)
    expect(nextScheduleDay('2026-12-21')).toBeNull()
  })

  it('puts every day back in the section it came from', () => {
    for (const s of SCHEDULE) {
      for (const d of s.days) expect(sectionOf(d).name).toBe(s.name)
    }
  })

  it('gives each section an anchor of its own for the jump links', () => {
    const anchors = SCHEDULE.map(anchorOf)
    expect(new Set(anchors).size).toBe(SCHEDULE.length)
    for (const a of anchors) expect(a).toMatch(/^[a-z0-9-]+$/)
  })
})
