import 'server-only'
import { db } from '../supabase/admin'
import { getPaperById } from './papers'
import { scoreAttempt, type ResponseInput } from '../scoring'
import type { OptionLabel } from '../types'

/**
 * Correcting an answer key after a paper has run (FR-6.9.2).
 *
 * This is P0, not a nicety. A wrong key with no way back destroys trust in the
 * leaderboard permanently, and the leaderboard is the whole product.
 *
 * Because the board is computed on read (FR-6.7.3) there is no cache to
 * invalidate: rescoring the attempts is the entire operation, and the board is
 * correct on the next page load.
 */

export interface RescoreReport {
  questionNumber: number
  from: OptionLabel
  to: OptionLabel
  attemptsRescored: number
  changed: { attemptId: string; before: number; after: number }[]
}

export async function correctAnswerKey(
  testId: string, questionId: string, newAnswer: OptionLabel,
): Promise<RescoreReport> {
  const client = db()

  const { data: question } = await client
    .from('questions').select('id, number, options, correct_option').eq('id', questionId).maybeSingle()
  if (!question) throw new Error('That question no longer exists.')

  const options = question.options as Record<string, string>
  if (!(newAnswer in options)) {
    throw new Error(`Q${question.number} has no option ${newAnswer}. Present: ${Object.keys(options).join(', ')}.`)
  }
  const before = question.correct_option as OptionLabel
  if (before === newAnswer) {
    return { questionNumber: question.number as number, from: before, to: newAnswer, attemptsRescored: 0, changed: [] }
  }

  const { error: updateError } = await client
    .from('questions').update({ correct_option: newAnswer }).eq('id', questionId)
  if (updateError) throw new Error(`Could not update the key: ${updateError.message}`)

  const report = await rescoreTest(testId)

  await client.from('tests').update({ rescored_at: new Date().toISOString() }).eq('id', testId)

  return {
    questionNumber: question.number as number,
    from: before,
    to: newAnswer,
    attemptsRescored: report.rescored,
    changed: report.changed,
  }
}

/** Recompute every attempt on a paper against the current keys. */
export async function rescoreTest(testId: string): Promise<{
  rescored: number
  changed: { attemptId: string; before: number; after: number }[]
}> {
  const client = db()
  const record = await getPaperById(testId)
  if (!record) throw new Error('That paper no longer exists.')

  const { data: attempts } = await client
    .from('attempts')
    .select('id, total_score')
    .eq('test_id', testId)
    .in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])

  const changed: { attemptId: string; before: number; after: number }[] = []

  for (const attempt of attempts ?? []) {
    const { data: rows } = await client
      .from('responses')
      .select('selected_option, was_visited, questions(number)')
      .eq('attempt_id', attempt.id)

    const responses: ResponseInput[] = (rows ?? []).map((r) => ({
      questionNumber: (r.questions as unknown as { number: number }).number,
      selectedOption: (r.selected_option as OptionLabel | null) ?? null,
      wasVisited: r.was_visited as boolean,
    }))

    const score = scoreAttempt(record.paper, responses)
    const previous = Number(attempt.total_score ?? 0)

    await client.from('attempts').update({
      total_score: score.totalScore,
      section_scores: score.sections,
      attempted: score.attempted,
      correct: score.correct,
      wrong: score.wrong,
      skipped: score.skipped,
      not_reached: score.notReached,
    }).eq('id', attempt.id)

    if (previous !== score.totalScore) {
      changed.push({ attemptId: attempt.id as string, before: previous, after: score.totalScore })
    }
  }

  return { rescored: (attempts ?? []).length, changed }
}

/**
 * Items worth a second look (FR-6.9.4): a question almost nobody got right is
 * usually a wrong key rather than a hard question. The single item statistic
 * the admin sees.
 */
export interface ItemStat {
  questionId: string
  number: number
  correctPct: number | null
  attempts: number
  suspicious: boolean
}

export async function getItemStats(testId: string): Promise<ItemStat[]> {
  const client = db()
  const { data: sections } = await client.from('sections').select('id').eq('test_id', testId)
  const sectionIds = (sections ?? []).map((s) => s.id as string)
  if (!sectionIds.length) return []

  const { data: questions } = await client
    .from('questions').select('id, number, correct_option').in('section_id', sectionIds).order('number')

  const ids = (questions ?? []).map((q) => q.id as string)
  const { data: responses } = await client
    .from('responses').select('question_id, selected_option')
    .in('question_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  const tally = new Map<string, { answered: number; correct: number }>()
  for (const q of questions ?? []) tally.set(q.id as string, { answered: 0, correct: 0 })
  for (const r of responses ?? []) {
    if (!r.selected_option) continue
    const t = tally.get(r.question_id as string)
    if (!t) continue
    t.answered++
    const q = (questions ?? []).find((x) => x.id === r.question_id)
    if (q && q.correct_option === r.selected_option) t.correct++
  }

  return (questions ?? []).map((q) => {
    const t = tally.get(q.id as string)!
    const pct = t.answered === 0 ? null : Math.round((t.correct / t.answered) * 100)
    return {
      questionId: q.id as string,
      number: q.number as number,
      correctPct: pct,
      attempts: t.answered,
      // Below 10% correct with a real sample behind it is the signal.
      suspicious: pct !== null && pct < 10 && t.answered >= 3,
    }
  })
}
