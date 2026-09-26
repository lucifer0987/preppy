import 'server-only'
import { db } from '../supabase/admin'
import { getPaperById } from './papers'
import { itemVerdict, scoreAttempt, type ItemTally, type ResponseInput } from '../scoring'
import { selectAll } from './select-all'
import { OPTION_LABELS, type OptionLabel } from '../types'

/**
 * Correcting an answer key after a paper has run (FR-6.9.3).
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

const FINISHED = ['SUBMITTED', 'AUTO_SUBMITTED']

/**
 * Sets a question's key and rescores every finished attempt on its paper, as
 * one transaction (apply_rescore in supabase/migrations): the key and the
 * scores can never disagree, and a failure changes nothing.
 *
 * Scores are computed here against the new key, then written together. If a
 * student finishes between the two, the database refuses the stale set and
 * the whole thing is recomputed.
 *
 * Dry runs are rescored too, so the admin's own numbers stay truthful, but
 * only an attempt whose result actually moved is stamped `rescored_at`. That
 * stamp is what shows a student the "this test was rescored" notice
 * (FR-6.9.3), so nobody whose score did not change is told it did.
 */
export async function correctAnswerKey(
  testId: string, questionId: string, newAnswer: OptionLabel,
): Promise<RescoreReport> {
  const client = db()

  // sections!inner scopes the lookup to this paper, so a question id from a
  // different paper (a stale form, a hand-edited request) is refused.
  const { data: question, error: findError } = await client
    .from('questions').select('id, number, options, correct_option, sections!inner(test_id)')
    .eq('id', questionId).eq('sections.test_id', testId).maybeSingle()
  if (findError) throw new Error(`Could not read the question: ${findError.message}`)
  if (!question) throw new Error('That question is not on this paper.')

  const options = question.options as Record<string, string>
  if (!OPTION_LABELS.includes(newAnswer) || typeof options[newAnswer] !== 'string') {
    throw new Error(`Q${question.number} has no option ${newAnswer}. Present: ${Object.keys(options).join(', ')}.`)
  }
  const number = question.number as number
  const before = question.correct_option as OptionLabel

  for (let attempt = 0; attempt < 3; attempt++) {
    const computed = await scoreAgainst(testId, number, newAnswer)
    const { error } = await client.rpc('apply_rescore', {
      p_test: testId, p_question: questionId, p_answer: newAnswer, p_rows: computed.rows,
    })
    if (!error) {
      return { questionNumber: number, from: before, to: newAnswer, attemptsRescored: computed.rows.length, changed: computed.changed }
    }
    if (!/RESCORE_STALE/.test(error.message)) throw new Error(`Could not rescore: ${error.message}`)
    // Someone finished the paper meanwhile; score again with them included.
  }
  throw new Error('Students kept finishing while the rescore ran. Nothing was changed; try again in a minute.')
}

/** Every finished attempt on the paper, scored as if `number` had key `answer`. */
async function scoreAgainst(testId: string, number: number, answer: OptionLabel) {
  const client = db()
  const record = await getPaperById(testId)
  if (!record) throw new Error('That paper no longer exists.')
  const paper = {
    ...record.paper,
    sections: record.paper.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) => (q.number === number ? { ...q, answer } : q)),
    })),
  }

  const attempts = await selectAll<Record<string, unknown>>('attempts', (from, to) =>
    client.from('attempts')
      .select('id, total_score, correct, wrong')
      .eq('test_id', testId).in('state', FINISHED)
      .order('id').range(from, to))

  // All their answers in one paged read rather than one query per attempt.
  const responseRows = await selectAll<Record<string, unknown>>('answers', (from, to) =>
    client.from('responses')
      .select('id, attempt_id, selected_option, was_visited, questions(number), attempts!inner(test_id, state)')
      .eq('attempts.test_id', testId).in('attempts.state', FINISHED)
      .order('id').range(from, to))
  const byAttempt = new Map<string, ResponseInput[]>()
  for (const r of responseRows) {
    const list = byAttempt.get(r['attempt_id'] as string) ?? []
    list.push({
      questionNumber: (r['questions'] as { number: number }).number,
      selectedOption: (r['selected_option'] as OptionLabel | null) ?? null,
      wasVisited: r['was_visited'] as boolean,
    })
    byAttempt.set(r['attempt_id'] as string, list)
  }

  const changed: RescoreReport['changed'] = []
  const rows = attempts.map((a) => {
    const id = a['id'] as string
    const score = scoreAttempt(paper, byAttempt.get(id) ?? [])
    const previous = Number(a['total_score'] ?? 0)
    const moved = previous !== score.totalScore || a['correct'] !== score.correct || a['wrong'] !== score.wrong
    if (moved) changed.push({ attemptId: id, before: previous, after: score.totalScore })
    return {
      id,
      total_score: score.totalScore,
      section_scores: score.sections,
      attempted: score.attempted,
      correct: score.correct,
      wrong: score.wrong,
      skipped: score.skipped,
      not_reached: score.notReached,
      moved,
    }
  })
  return { rows, changed }
}

/**
 * Items worth a second look (FR-6.9.4): a question almost nobody got right is
 * usually a wrong key rather than a hard question. The single item statistic
 * the admin sees. The flagging rule itself lives in scoring.ts, where it is
 * tested.
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
  const { data: sections, error: sectionError } = await client.from('sections').select('id').eq('test_id', testId)
  if (sectionError) throw new Error(`Could not read the paper: ${sectionError.message}`)
  const sectionIds = (sections ?? []).map((s) => s.id as string)
  if (!sectionIds.length) return []

  const { data: questions, error: questionError } = await client
    .from('questions').select('id, number, correct_option').in('section_id', sectionIds).order('number')
  if (questionError) throw new Error(`Could not read the questions: ${questionError.message}`)

  // Only counted attempts say anything about the key: the admin's dry runs,
  // attempts still running and voided ones are left out, exactly as they are
  // left out of the board. attempts!inner applies those filters to the
  // response rows themselves.
  const responses = await selectAll<Record<string, unknown>>('responses', (from, to) =>
    client.from('responses')
      .select('id, question_id, selected_option, attempts!inner(test_id, is_dry_run, state)')
      .eq('attempts.test_id', testId)
      .eq('attempts.is_dry_run', false)
      .in('attempts.state', ['SUBMITTED', 'AUTO_SUBMITTED'])
      .not('selected_option', 'is', null)
      .order('id')
      .range(from, to))

  const keyById = new Map((questions ?? []).map((q) => [q.id as string, q.correct_option as string]))
  const tally = new Map<string, ItemTally>()
  for (const q of questions ?? []) tally.set(q.id as string, { answered: 0, correct: 0 })
  for (const r of responses) {
    const t = tally.get(r['question_id'] as string)
    if (!t) continue
    t.answered++
    if (keyById.get(r['question_id'] as string) === r['selected_option']) t.correct++
  }

  return (questions ?? []).map((q) => {
    const t = tally.get(q.id as string)!
    return {
      questionId: q.id as string,
      number: q.number as number,
      attempts: t.answered,
      ...itemVerdict(t),
    }
  })
}
