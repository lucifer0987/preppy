import 'server-only'
import { db } from '../supabase/admin'
import { getPaperById } from './papers'
import { itemVerdict, scoreAttempt, type ItemTally, type ResponseInput } from '../scoring'
import { selectAll } from './select-all'
import { OPTION_LABELS, type OptionLabel, type SectionCode } from '../types'

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
    const computed = await scoreAgainst(testId, { number, answer: newAnswer })
    const { error } = await client.rpc('apply_rescore', {
      p_test: testId, p_question: questionId, p_answer: newAnswer, p_rows: computed.rows,
    })
    if (!error) {
      return { questionNumber: number, from: before, to: newAnswer, attemptsRescored: computed.rows.length, changed: computed.changed }
    }
    if (/QUESTION_NOT_ON_PAPER/.test(error.message)) {
      // The paper was replaced, or the question deleted, between the admin
      // opening the screen and pressing save.
      throw new Error('That question is no longer part of this paper. Reload and try again.')
    }
    if (!/RESCORE_STALE/.test(error.message)) throw new Error(`Could not rescore: ${error.message}`)
    // Someone finished the paper meanwhile; score again with them included.
  }
  throw new Error('Students kept finishing while the rescore ran. Nothing was changed; try again in a minute.')
}

/**
 * Score every finished attempt again against the paper as it now stands.
 *
 * Correcting a key has always done this for the one question it touched. This
 * is the same write for everything else that moves a score without moving a
 * key -- the marking of a section, most of all -- so the board and the results
 * never disagree with the paper they came from.
 *
 * Nothing here decides what changed; the caller has already written it. This
 * only makes the stored scores agree with it again.
 */
export async function rescorePaper(testId: string): Promise<{ rescored: number; moved: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const computed = await scoreAgainst(testId)
    const { error } = await db().rpc('apply_paper_rescore', { p_test: testId, p_rows: computed.rows })
    if (!error) return { rescored: computed.rows.length, moved: computed.changed.length }
    if (!/RESCORE_STALE/.test(error.message)) throw new Error(`Could not rescore: ${error.message}`)
    // Someone finished the paper meanwhile; score again with them included.
  }
  throw new Error('Students kept finishing while the rescore ran. Nothing was changed; try again in a minute.')
}

/**
 * Change what a section's questions are worth, and settle every score that
 * already depended on the old numbers.
 *
 * The two writes are not one transaction, and do not need to be: the rescore
 * is idempotent, so a failure between them leaves scores that are merely
 * stale and running it again fixes them. Scores written against marks that
 * were never saved would be the unrecoverable order, which is why the marks
 * go first.
 */
export async function setSectionMarks(
  testId: string,
  marks: { code: SectionCode; marksCorrect: number; marksNegative: number }[],
): Promise<{ rescored: number; moved: number }> {
  for (const m of marks) {
    if (!(m.marksCorrect > 0 && m.marksCorrect <= 10)) {
      throw new Error('A right answer must be worth more than 0 and at most 10 marks.')
    }
    if (!(m.marksNegative >= 0 && m.marksNegative <= 10)) {
      throw new Error('A wrong answer must cost between 0 and 10 marks.')
    }
    const { error } = await db().from('sections')
      .update({ marks_correct: m.marksCorrect, marks_negative: m.marksNegative })
      .eq('test_id', testId).eq('code', m.code)
    if (error) throw new Error(`Could not save the marking: ${error.message}`)
  }
  return rescorePaper(testId)
}

/**
 * Every finished attempt on the paper, scored against the paper as it stands
 * -- optionally with one key swapped, which is what a key correction works out
 * before it writes anything.
 */
async function scoreAgainst(
  testId: string, override?: { number: number; answer: OptionLabel },
) {
  const client = db()
  const record = await getPaperById(testId)
  if (!record) throw new Error('That paper no longer exists.')
  const paper = override
    ? {
        ...record.paper,
        sections: record.paper.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => (
            q.number === override.number ? { ...q, answer: override.answer } : q
          )),
        })),
      }
    : record.paper

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
