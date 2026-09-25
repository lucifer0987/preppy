import type { OptionLabel, Paper, SectionCode } from './types'

/**
 * Scoring (PRD section 3.2) and the not-reached / skipped split (FR-3.4).
 *
 * Pure, because a scoring bug is the one defect that silently corrupts the
 * leaderboard rather than announcing itself.
 *
 *   no response row        -> not reached (never opened; a pacing failure)
 *   row, no option chosen  -> skipped     (opened and passed over; a decision)
 *
 * The remedies are opposite, which is why they are counted apart.
 */

export interface ResponseInput {
  questionNumber: number
  selectedOption: OptionLabel | null
  /** A row exists at all, meaning the student opened the question. */
  wasVisited: boolean
}

export interface SectionScore {
  code: SectionCode
  score: number
  attempted: number
  correct: number
  wrong: number
  skipped: number
  notReached: number
  /** correct / attempted, or null when nothing was attempted. */
  accuracyPct: number | null
}

export interface AttemptScore {
  totalScore: number
  attempted: number
  correct: number
  wrong: number
  skipped: number
  notReached: number
  accuracyPct: number | null
  sections: SectionScore[]
}

export function scoreAttempt(paper: Paper, responses: ResponseInput[]): AttemptScore {
  const byNumber = new Map(responses.map((r) => [r.questionNumber, r]))
  const sections: SectionScore[] = []

  for (const section of paper.sections) {
    const marksCorrect = section.marksCorrect ?? 1
    const marksNegative = section.marksNegative ?? 0.25

    let score = 0, correct = 0, wrong = 0, skipped = 0, notReached = 0

    for (const question of section.questions) {
      const response = byNumber.get(question.number)

      if (!response || !response.wasVisited) { notReached++; continue }
      if (response.selectedOption === null) { skipped++; continue }

      if (response.selectedOption === question.answer) {
        correct++
        score += marksCorrect
      } else {
        wrong++
        score -= marksNegative
      }
    }

    const attempted = correct + wrong
    sections.push({
      code: section.code,
      score: round2(score),
      attempted, correct, wrong, skipped, notReached,
      accuracyPct: attempted === 0 ? null : round2((correct / attempted) * 100),
    })
  }

  const sum = (pick: (s: SectionScore) => number) => sections.reduce((a, s) => a + pick(s), 0)
  const attempted = sum((s) => s.attempted)
  const correct = sum((s) => s.correct)

  return {
    totalScore: round2(sum((s) => s.score)),
    attempted,
    correct,
    wrong: sum((s) => s.wrong),
    skipped: sum((s) => s.skipped),
    notReached: sum((s) => s.notReached),
    accuracyPct: attempted === 0 ? null : round2((correct / attempted) * 100),
    sections,
  }
}

/** The best and worst a paper can score, for the result page. */
export function scoreBounds(paper: Paper): { max: number; min: number } {
  let max = 0, min = 0
  for (const s of paper.sections) {
    max += s.questions.length * (s.marksCorrect ?? 1)
    min -= s.questions.length * (s.marksNegative ?? 0.25)
  }
  return { max: round2(max), min: round2(min) }
}

/**
 * A plain-language read of the skipped / not-reached split, shown on the
 * result page. Skipping too much is a confidence problem; not reaching
 * questions is a speed problem, and the fixes are different.
 */
export function pacingVerdict(section: SectionScore): string | null {
  // Derived from the section's own counts rather than the default pattern, so
  // a paper that overrides its question count still gets sensible thresholds.
  const total = section.correct + section.wrong + section.skipped + section.notReached
  if (total === 0) return null
  if (section.notReached >= Math.max(3, Math.ceil(total * 0.2))) {
    return `You never reached ${section.notReached} question${section.notReached === 1 ? '' : 's'}. That is a speed problem, not a knowledge problem.`
  }
  if (section.skipped >= Math.max(3, Math.ceil(total * 0.3))) {
    return `You saw ${section.skipped} question${section.skipped === 1 ? '' : 's'} and passed on ${section.skipped === 1 ? 'it' : 'them'}. That is a confidence problem, not a pacing one.`
  }
  return null
}

/**
 * Time used in one section, from the server's own stamps (PRD 6.6). Capped at
 * the section's allowance, so a late stamp can never read as more time than
 * the student had. Null when the section was never opened or never closed.
 */
export function sectionTimeUsed(
  startedAt: Date | null, endedAt: Date | null, durationSec: number,
): number | null {
  if (!startedAt || !endedAt) return null
  const used = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  return Math.min(durationSec, Math.max(0, used))
}

export interface QuestionTime {
  questionNumber: number
  timeSpentSec: number
}

/**
 * The questions that cost the most time, per section (PRD 6.6: "slowest three
 * questions per section"). Only questions the student actually spent time on
 * are candidates; ties go to the lower question number so the list is stable.
 */
export function slowestQuestions(
  paper: Paper, times: QuestionTime[], perSection = 3,
): { code: SectionCode; questions: QuestionTime[] }[] {
  return paper.sections.map((section) => {
    const numbers = new Set(section.questions.map((q) => q.number))
    const questions = times
      .filter((t) => numbers.has(t.questionNumber) && t.timeSpentSec > 0)
      .sort((a, b) => b.timeSpentSec - a.timeSpentSec || a.questionNumber - b.questionNumber)
      .slice(0, perSection)
    return { code: section.code, questions }
  })
}

/**
 * FR-6.9.4: any item below 10% correct is flagged for key review.
 *
 * With a cohort of five, 10% means nobody got it right. One wrong answer is one
 * student's mistake; two students independently landing on something other
 * than the key is worth the admin's glance. Any higher and a bad key on a
 * question only two or three people reached would never flag.
 */
export const ITEM_FLAG_MIN_ANSWERED = 2
export const ITEM_FLAG_BELOW_PCT = 10

export interface ItemTally {
  answered: number
  correct: number
}

export function itemVerdict(t: ItemTally): { correctPct: number | null; suspicious: boolean } {
  const correctPct = t.answered === 0 ? null : Math.round((t.correct / t.answered) * 100)
  return {
    correctPct,
    suspicious: correctPct !== null
      && (t.correct / t.answered) * 100 < ITEM_FLAG_BELOW_PCT
      && t.answered >= ITEM_FLAG_MIN_ANSWERED,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
