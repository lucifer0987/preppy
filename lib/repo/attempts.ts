import 'server-only'
import { db } from '../supabase/admin'
import { advanceSection, attemptStatus, type AttemptStatus, type SectionEndReason, type SectionProgress } from '../attempt'
import { scoreAttempt, type ResponseInput } from '../scoring'
import { hardStopAt } from '../time'
import { getPaperById } from './papers'
import type { OptionLabel, PaperQuestion, SectionCode } from '../types'

/**
 * Attempts: starting, resuming, recording responses, submitting.
 *
 * FR-13.1 is enforced here rather than in the UI. `loadLiveSection` selects
 * the columns a student is allowed to see and simply never reads
 * correct_option or solution, so the answer key cannot reach the browser even
 * if a component asked for it.
 */

/** A question as a student sees it mid-test: no answer, no solution. */
export interface LiveQuestion {
  id: string
  number: number
  text: string
  options: Partial<Record<OptionLabel, string>>
  imagePaths: string[]
  directions: { from: number; to: number; text: string; table: unknown | null } | null
}

export interface LiveResponse {
  questionId: string
  questionNumber: number
  selectedOption: OptionLabel | null
  isMarked: boolean
}

export interface LiveSection {
  code: SectionCode
  position: number
  totalSections: number
  questions: LiveQuestion[]
  responses: LiveResponse[]
}

export interface AttemptSnapshot {
  attemptId: string
  testId: string
  testDate: string
  isDryRun: boolean
  status: AttemptStatus
  fullscreenExits: number
  tabSwitches: number
  section: LiveSection | null
}

async function loadSectionProgress(attemptId: string): Promise<{ rows: SectionProgress[]; idByPosition: Map<number, string> }> {
  const { data } = await db()
    .from('attempt_sections')
    .select('section_id, started_at, ended_at, end_reason, sections(id, code, position, duration_sec)')
    .eq('attempt_id', attemptId)

  const rows: SectionProgress[] = []
  const idByPosition = new Map<number, string>()
  for (const r of data ?? []) {
    const s = r.sections as unknown as { id: string; code: SectionCode; position: number; duration_sec: number }
    rows.push({
      code: s.code,
      position: s.position,
      durationSec: s.duration_sec,
      startedAt: r.started_at ? new Date(r.started_at as string) : null,
      endedAt: r.ended_at ? new Date(r.ended_at as string) : null,
      endReason: (r.end_reason as SectionEndReason | null) ?? null,
    })
    idByPosition.set(s.position, s.id)
  }
  return { rows: rows.sort((a, b) => a.position - b.position), idByPosition }
}

/**
 * Create the attempt and open its first section.
 *
 * The caller must already have checked the window (canStartAttempt) and that
 * no counted attempt exists. started_at is stamped here, on the server, at the
 * moment Begin is pressed — never on page load (FR-6.3.1).
 */
export async function startAttempt(testId: string, userId: string, isDryRun: boolean): Promise<string> {
  const client = db()
  const now = new Date().toISOString()

  const { data: attempt, error } = await client
    .from('attempts')
    .insert({ test_id: testId, user_id: userId, is_dry_run: isDryRun, started_at: now, state: 'IN_PROGRESS' })
    .select('id')
    .single()

  if (error || !attempt) {
    if (error?.code === '23505') throw new Error('You have already taken this paper.')
    throw new Error(`Could not start the attempt: ${error?.message ?? 'unknown error'}`)
  }

  const { data: sections } = await client
    .from('sections').select('id, position').eq('test_id', testId).order('position')

  if (!sections?.length) {
    await client.from('attempts').delete().eq('id', attempt.id)
    throw new Error('That paper has no sections. It cannot be attempted.')
  }

  // Every section gets a row up front; only the first is open.
  const { error: sectionError } = await client.from('attempt_sections').insert(
    sections.map((s, i) => ({
      attempt_id: attempt.id,
      section_id: s.id,
      started_at: i === 0 ? now : null,
      ended_at: null,
    })),
  )
  if (sectionError) {
    await client.from('attempts').delete().eq('id', attempt.id)
    throw new Error(`Could not start the attempt: ${sectionError.message}`)
  }

  return attempt.id as string
}

export async function findAttempt(testId: string, userId: string, isDryRun: boolean) {
  const { data } = await db()
    .from('attempts')
    .select('id, state, is_dry_run, started_at, submitted_at, total_score')
    .eq('test_id', testId).eq('user_id', userId).eq('is_dry_run', isDryRun)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * Everything the live test screen needs, with the current section resolved and
 * any expired section closed first.
 */
export async function loadAttempt(attemptId: string): Promise<AttemptSnapshot | null> {
  const client = db()
  const { data: attempt } = await client
    .from('attempts')
    .select('id, test_id, state, is_dry_run, fullscreen_exits, tab_switches, tests(date)')
    .eq('id', attemptId)
    .maybeSingle()
  if (!attempt) return null

  const testDate = (attempt.tests as unknown as { date: string }).date
  const hardStop = hardStopAt(testDate)

  // Roll forward past any section whose timer ran out while nobody was looking.
  await closeExpiredSections(attemptId, hardStop)

  const { rows } = await loadSectionProgress(attemptId)
  const status = attemptStatus(rows, new Date(), hardStop)

  const section = status.currentPosition === null
    ? null
    : await loadLiveSection(attempt.test_id as string, attemptId, status.currentPosition, rows.length)

  return {
    attemptId: attempt.id as string,
    testId: attempt.test_id as string,
    testDate,
    isDryRun: attempt.is_dry_run as boolean,
    status,
    fullscreenExits: attempt.fullscreen_exits as number,
    tabSwitches: attempt.tab_switches as number,
    section,
  }
}

/**
 * Advance through every section whose allowance has elapsed.
 *
 * Runs on read rather than on a timer, so a student who closes the laptop
 * mid-section and returns twenty minutes later lands in the right place with
 * the right time left, and the sections they slept through are closed with
 * TIMER_EXPIRED rather than silently reopened.
 */
async function closeExpiredSections(attemptId: string, hardStop: Date): Promise<void> {
  const client = db()
  for (let guard = 0; guard < 16; guard++) {
    const { rows } = await loadSectionProgress(attemptId)
    const now = new Date()
    const status = attemptStatus(rows, now, hardStop)
    if (status.currentPosition === null || !status.sectionExpired) return

    const open = rows.find((s) => s.position === status.currentPosition)!
    const endAt = open.startedAt
      ? new Date(Math.min(open.startedAt.getTime() + open.durationSec * 1000, hardStop.getTime()))
      : now
    const reason: SectionEndReason = now.getTime() >= hardStop.getTime() ? 'FORCE_CLOSED' : 'TIMER_EXPIRED'
    const { closed, opened } = advanceSection(rows, endAt, reason)
    if (!closed) return

    const { idByPosition } = await loadSectionProgress(attemptId)
    await client.from('attempt_sections')
      .update({ ended_at: endAt.toISOString(), end_reason: reason })
      .eq('attempt_id', attemptId).eq('section_id', idByPosition.get(closed.position))

    if (opened) {
      await client.from('attempt_sections')
        .update({ started_at: endAt.toISOString() })
        .eq('attempt_id', attemptId).eq('section_id', idByPosition.get(opened.position))
    } else {
      return
    }
  }
}

/** FR-13.1: correct_option and solution are never selected here. */
async function loadLiveSection(
  testId: string, attemptId: string, position: number, totalSections: number,
): Promise<LiveSection | null> {
  const client = db()
  const { data: section } = await client
    .from('sections').select('id, code, position').eq('test_id', testId).eq('position', position).maybeSingle()
  if (!section) return null

  const { data: questions } = await client
    .from('questions')
    .select('id, number, text, options, image_paths, direction_blocks(q_from, q_to, content, table_data)')
    .eq('section_id', section.id)
    .order('number')

  const ids = (questions ?? []).map((q) => q.id as string)
  const { data: responses } = await client
    .from('responses')
    .select('question_id, selected_option, is_marked, questions(number)')
    .eq('attempt_id', attemptId)
    .in('question_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  return {
    code: section.code as SectionCode,
    position: section.position as number,
    totalSections,
    questions: (questions ?? []).map((q) => {
      const d = q.direction_blocks as unknown as
        { q_from: number; q_to: number; content: string; table_data: unknown } | null
      return {
        id: q.id as string,
        number: q.number as number,
        text: q.text as string,
        options: q.options as Partial<Record<OptionLabel, string>>,
        imagePaths: (q.image_paths as string[]) ?? [],
        directions: d ? { from: d.q_from, to: d.q_to, text: d.content, table: d.table_data } : null,
      }
    }),
    responses: (responses ?? []).map((r) => ({
      questionId: r.question_id as string,
      questionNumber: (r.questions as unknown as { number: number }).number,
      selectedOption: (r.selected_option as OptionLabel | null) ?? null,
      isMarked: r.is_marked as boolean,
    })),
  }
}

/**
 * Record that a question was opened, or answered, or flagged.
 *
 * The row is written the moment the question is opened, with no option chosen.
 * That is what makes "not reached" distinguishable from "skipped" (FR-9.1).
 */
export async function recordResponse(
  attemptId: string,
  questionId: string,
  patch: { selectedOption?: OptionLabel | null; isMarked?: boolean },
): Promise<void> {
  const { error } = await db().from('responses').upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      was_visited: true,
      updated_at: new Date().toISOString(),
      ...(patch.selectedOption !== undefined ? { selected_option: patch.selectedOption } : {}),
      ...(patch.isMarked !== undefined ? { is_marked: patch.isMarked } : {}),
    },
    { onConflict: 'attempt_id,question_id' },
  )
  if (error) throw new Error(`Could not save that response: ${error.message}`)
}

export async function bumpIntegrityCounter(
  attemptId: string, which: 'fullscreen_exits' | 'tab_switches',
): Promise<void> {
  const client = db()
  const { data } = await client.from('attempts').select(which).eq('id', attemptId).maybeSingle()
  if (!data) return
  const current = (data as Record<string, number>)[which] ?? 0
  await client.from('attempts').update({ [which]: current + 1 }).eq('id', attemptId)
}

/** Close the open section early and open the next (FR-6.4.3). */
export async function moveToNextSection(attemptId: string): Promise<{ finished: boolean }> {
  const client = db()
  const { data: attempt } = await client
    .from('attempts').select('id, tests(date)').eq('id', attemptId).maybeSingle()
  if (!attempt) throw new Error('That attempt does not exist.')

  const hardStop = hardStopAt((attempt.tests as unknown as { date: string }).date)
  const { rows, idByPosition } = await loadSectionProgress(attemptId)
  const now = new Date()
  const { closed, opened } = advanceSection(rows, now, 'SUBMITTED')
  if (!closed) return { finished: true }

  await client.from('attempt_sections')
    .update({ ended_at: now.toISOString(), end_reason: 'SUBMITTED' })
    .eq('attempt_id', attemptId).eq('section_id', idByPosition.get(closed.position))

  if (!opened) return { finished: true }

  await client.from('attempt_sections')
    .update({ started_at: now.toISOString() })
    .eq('attempt_id', attemptId).eq('section_id', idByPosition.get(opened.position))

  const status = attemptStatus(
    rows.map((s) => s.position === closed.position ? closed : s.position === opened.position ? opened : s),
    now, hardStop,
  )
  return { finished: status.finished }
}

/**
 * Score the attempt and close it.
 *
 * Idempotent: an attempt already submitted is returned as-is, so the 00:05
 * job and a student's own End Test cannot double-score the same paper.
 */
export async function submitAttempt(
  attemptId: string, reason: 'SUBMITTED' | 'AUTO_SUBMITTED',
): Promise<void> {
  const client = db()
  const { data: attempt } = await client
    .from('attempts').select('id, test_id, state, started_at').eq('id', attemptId).maybeSingle()
  if (!attempt) throw new Error('That attempt does not exist.')
  if (attempt.state !== 'IN_PROGRESS') return

  const record = await getPaperById(attempt.test_id as string)
  if (!record) throw new Error('That paper no longer exists.')

  const { data: rows } = await client
    .from('responses')
    .select('selected_option, was_visited, questions(number)')
    .eq('attempt_id', attemptId)

  const responses: ResponseInput[] = (rows ?? []).map((r) => ({
    questionNumber: (r.questions as unknown as { number: number }).number,
    selectedOption: (r.selected_option as OptionLabel | null) ?? null,
    wasVisited: r.was_visited as boolean,
  }))

  const score = scoreAttempt(record.paper, responses)
  const now = new Date()
  const startedAt = new Date(attempt.started_at as string)

  // Close any section still open, so the record is complete.
  const { rows: progress, idByPosition } = await loadSectionProgress(attemptId)
  for (const s of progress) {
    if (s.endedAt === null) {
      await client.from('attempt_sections')
        .update({ ended_at: now.toISOString(), end_reason: reason === 'SUBMITTED' ? 'SUBMITTED' : 'FORCE_CLOSED' })
        .eq('attempt_id', attemptId).eq('section_id', idByPosition.get(s.position))
    }
  }

  const { error } = await client.from('attempts').update({
    state: reason,
    submitted_at: now.toISOString(),
    total_score: score.totalScore,
    section_scores: score.sections,
    attempted: score.attempted,
    correct: score.correct,
    wrong: score.wrong,
    skipped: score.skipped,
    not_reached: score.notReached,
    time_spent_sec: Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000)),
  }).eq('id', attemptId)

  if (error) throw new Error(`Could not submit the attempt: ${error.message}`)
}

/** The questions with their answers, for review after the embargo lifts. */
export async function loadReview(attemptId: string): Promise<{
  paper: Awaited<ReturnType<typeof getPaperById>>
  responses: Map<number, { selected: OptionLabel | null; visited: boolean }>
} | null> {
  const client = db()
  const { data: attempt } = await client
    .from('attempts').select('test_id').eq('id', attemptId).maybeSingle()
  if (!attempt) return null

  const paper = await getPaperById(attempt.test_id as string)
  const { data: rows } = await client
    .from('responses').select('selected_option, was_visited, questions(number)').eq('attempt_id', attemptId)

  const responses = new Map<number, { selected: OptionLabel | null; visited: boolean }>()
  for (const r of rows ?? []) {
    responses.set((r.questions as unknown as { number: number }).number, {
      selected: (r.selected_option as OptionLabel | null) ?? null,
      visited: r.was_visited as boolean,
    })
  }
  return { paper, responses }
}

export type { PaperQuestion }
