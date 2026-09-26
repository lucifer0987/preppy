import 'server-only'
import { db } from '../supabase/admin'
import { getWindow } from './settings'
import {
  advanceSection, attemptHardStop, attemptStatus, closeForSubmit, rollForward, timeSpentSec, writablePositions,
  type AttemptStatus, type SectionEndReason, type SectionProgress,
} from '../attempt'
import { scoreAttempt, type ResponseInput } from '../scoring'
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
  directions: { from: number; to: number; text: string; table: unknown | null; imagePaths: string[] } | null
}

export interface LiveResponse {
  questionId: string
  questionNumber: number
  selectedOption: OptionLabel | null
  isMarked: boolean
  timeSpentSec: number
}

export interface LiveSection {
  code: SectionCode
  position: number
  totalSections: number
  /** Where to resume: the question the student last had open. */
  resumeIndex: number
  questions: LiveQuestion[]
  responses: LiveResponse[]
}

export interface AttemptSnapshot {
  attemptId: string
  testId: string
  testDate: string
  isDryRun: boolean
  status: AttemptStatus
  /** The server's instant when this was read, so the client can correct for its own clock. */
  serverNowMs: number
  fullscreenExits: number
  tabSwitches: number
  section: LiveSection | null
}

/**
 * The attempt row and its section clocks, in one round trip.
 *
 * This is the lightweight read every write path uses: ownership, state and
 * which section is open, without touching questions or responses.
 */
export interface AttemptCore {
  id: string
  userId: string
  testId: string
  testDate: string
  state: string
  isDryRun: boolean
  startedAt: Date
  fullscreenExits: number
  tabSwitches: number
  hardStop: Date
  rows: SectionProgress[]
  idByPosition: Map<number, string>
}

export async function loadAttemptCore(attemptId: string): Promise<AttemptCore | null> {
  const { data: a, error } = await db()
    .from('attempts')
    .select('id, user_id, test_id, state, is_dry_run, started_at, fullscreen_exits, tab_switches, tests(date), attempt_sections(section_id, started_at, ended_at, end_reason, sections(code, position, duration_sec))')
    .eq('id', attemptId)
    .maybeSingle()
  // A failed read is not "no such attempt": callers treat null as gone.
  if (error) throw new Error(`Could not load the attempt: ${error.message}`)
  if (!a) return null

  const rows: SectionProgress[] = []
  const idByPosition = new Map<number, string>()
  for (const r of (a.attempt_sections ?? []) as unknown as {
    section_id: string; started_at: string | null; ended_at: string | null; end_reason: string | null
    sections: { code: SectionCode; position: number; duration_sec: number }
  }[]) {
    rows.push({
      code: r.sections.code,
      position: r.sections.position,
      durationSec: r.sections.duration_sec,
      startedAt: r.started_at ? new Date(r.started_at) : null,
      endedAt: r.ended_at ? new Date(r.ended_at) : null,
      endReason: (r.end_reason as SectionEndReason | null) ?? null,
    })
    idByPosition.set(r.sections.position, r.section_id)
  }
  rows.sort((x, y) => x.position - y.position)

  const testDate = (a.tests as unknown as { date: string }).date
  const isDryRun = a.is_dry_run as boolean
  const startedAt = new Date(a.started_at as string)
  return {
    id: a.id as string,
    userId: a.user_id as string,
    testId: a.test_id as string,
    testDate,
    state: a.state as string,
    isDryRun,
    startedAt,
    fullscreenExits: a.fullscreen_exits as number,
    tabSwitches: a.tab_switches as number,
    hardStop: attemptHardStop({ isDryRun, testDate, startedAt, sections: rows }, await getWindow()),
    rows,
    idByPosition,
  }
}

/**
 * Write whichever section rows differ between `before` and `after`.
 *
 * Each write is conditional on the column still being null, so two requests
 * racing to close the same section cannot overwrite one another. Returns the
 * positions whose close actually landed.
 */
async function writeSectionChanges(
  core: AttemptCore, before: SectionProgress[], after: SectionProgress[],
): Promise<Set<number>> {
  const client = db()
  const closedHere = new Set<number>()
  for (const s of after) {
    const was = before.find((b) => b.position === s.position)!
    const sectionId = core.idByPosition.get(s.position)
    if (!was.endedAt && s.endedAt) {
      const { data } = await client.from('attempt_sections')
        .update({ ended_at: s.endedAt.toISOString(), end_reason: s.endReason })
        .eq('attempt_id', core.id).eq('section_id', sectionId).is('ended_at', null)
        .select('section_id')
      if (data?.length) closedHere.add(s.position)
    } else if (!was.endedAt && !s.endedAt && s.endReason && s.endReason !== was.endReason) {
      // A never-reached section: only the reason is recorded.
      await client.from('attempt_sections')
        .update({ end_reason: s.endReason })
        .eq('attempt_id', core.id).eq('section_id', sectionId).is('ended_at', null)
    }
    if (!was.startedAt && s.startedAt) {
      await client.from('attempt_sections')
        .update({ started_at: s.startedAt.toISOString() })
        .eq('attempt_id', core.id).eq('section_id', sectionId).is('started_at', null)
    }
  }
  return closedHere
}

/**
 * Advance through every section whose allowance has elapsed.
 *
 * Runs on read rather than on a timer, so a student who closes the laptop
 * mid-section and returns twenty minutes later lands in the right place with
 * the right time left, and the sections they slept through are closed with
 * TIMER_EXPIRED rather than silently reopened. Returns the rows as they now
 * stand.
 */
async function closeExpiredSections(core: AttemptCore, now: Date): Promise<SectionProgress[]> {
  const rolled = rollForward(core.rows, now, core.hardStop)
  await writeSectionChanges(core, core.rows, rolled)
  return rolled
}

/**
 * Create the attempt and open its first section.
 *
 * The caller must already have checked the window (canStartAttempt) and that
 * no counted attempt exists. started_at is stamped here, on the server, at the
 * moment Begin is pressed — never on page load (FR-6.3.1).
 *
 * Returns the attempt to send the student to, which for a dry run may be one
 * that already exists (see below).
 */
export async function startAttempt(testId: string, userId: string, isDryRun: boolean): Promise<string> {
  // One transaction (start_attempt in supabase/schema.sql): the attempt and all
  // its section rows exist together, or neither does. A running dry run is
  // returned rather than doubled.
  const { data, error } = await db().rpc('start_attempt', { p_test: testId, p_user: userId, p_dry: isDryRun })
  if (error) {
    if (/ALREADY_TAKEN/.test(error.message)) throw new Error('You have already taken this paper.')
    if (/NO_SECTIONS/.test(error.message)) throw new Error('That paper has no sections. It cannot be attempted.')
    throw new Error(`Could not start the attempt: ${error.message}`)
  }
  return data as string
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
  const core = await loadAttemptCore(attemptId)
  // No section rows means startAttempt has not finished writing them, or
  // failed. Treating that as "every section closed" would score an empty paper.
  if (!core || core.rows.length === 0) return null

  const now = new Date()
  // Roll forward past any section whose timer ran out while nobody was looking.
  const rows = core.state === 'IN_PROGRESS' ? await closeExpiredSections(core, now) : core.rows
  const status = attemptStatus(rows, now, core.hardStop)

  // An attempt whose sections have all closed must be scored here, at the one
  // point every read passes through. Leaving it IN_PROGRESS with no open
  // section locks the student out of their own result: the test page sends
  // them to the result page because the attempt is over, and the result page
  // sends them back because the state still says in progress.
  if (status.finished && core.state === 'IN_PROGRESS') {
    await submitAttempt(attemptId, 'AUTO_SUBMITTED')
  }

  const section = status.currentPosition === null
    ? null
    : await loadLiveSection(core, status.currentPosition, rows.length)

  return {
    attemptId: core.id,
    testId: core.testId,
    testDate: core.testDate,
    isDryRun: core.isDryRun,
    status,
    serverNowMs: now.getTime(),
    fullscreenExits: core.fullscreenExits,
    tabSwitches: core.tabSwitches,
    section,
  }
}

/**
 * The authoritative clock for the resync path: rolls forward, submits if the
 * attempt is over, and never loads a question.
 */
export async function attemptClock(core: AttemptCore): Promise<AttemptStatus & { serverNowMs: number }> {
  const now = new Date()
  const rows = await closeExpiredSections(core, now)
  const status = attemptStatus(rows, now, core.hardStop)
  if (status.finished) await submitAttempt(core.id, 'AUTO_SUBMITTED')
  return { ...status, serverNowMs: now.getTime() }
}

/** FR-13.1: correct_option and solution are never selected here. */
async function loadLiveSection(
  core: AttemptCore, position: number, totalSections: number,
): Promise<LiveSection | null> {
  const client = db()
  const sectionId = core.idByPosition.get(position)
  const row = core.rows.find((s) => s.position === position)
  if (!sectionId || !row) return null

  const { data: questions, error: questionError } = await client
    .from('questions')
    .select('id, number, text, options, image_paths, direction_blocks(q_from, q_to, content, table_data, image_paths)')
    .eq('section_id', sectionId)
    .order('number')
  // An empty section on screen would look like a paper with no questions and
  // let the student skip it; a failed read must fail the page instead.
  if (questionError) throw new Error(`Could not load the questions: ${questionError.message}`)

  const ids = (questions ?? []).map((q) => q.id as string)
  const { data: responses, error: responseError } = await client
    .from('responses')
    .select('question_id, selected_option, is_marked, time_spent_sec, updated_at, questions(number)')
    .eq('attempt_id', core.id)
    .in('question_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  if (responseError) throw new Error(`Could not load your answers: ${responseError.message}`)

  // Resume at the question touched last (FR-6.4.8): every open writes the row,
  // so the newest updated_at is where the student was.
  let latest: { id: string; at: string } | null = null
  for (const r of responses ?? []) {
    const at = r.updated_at as string
    if (!latest || at > latest.at) latest = { id: r.question_id as string, at }
  }
  const resumeIndex = Math.max(0, latest ? ids.indexOf(latest.id) : 0)

  return {
    code: row.code,
    position,
    totalSections,
    resumeIndex,
    questions: (questions ?? []).map((q) => {
      const d = q.direction_blocks as unknown as
        { q_from: number; q_to: number; content: string; table_data: unknown; image_paths: string[] | null } | null
      return {
        id: q.id as string,
        number: q.number as number,
        text: q.text as string,
        options: q.options as Partial<Record<OptionLabel, string>>,
        imagePaths: (q.image_paths as string[]) ?? [],
        directions: d ? { from: d.q_from, to: d.q_to, text: d.content, table: d.table_data, imagePaths: d.image_paths ?? [] } : null,
      }
    }),
    responses: (responses ?? []).map((r) => ({
      questionId: r.question_id as string,
      questionNumber: (r.questions as unknown as { number: number }).number,
      selectedOption: (r.selected_option as OptionLabel | null) ?? null,
      isMarked: r.is_marked as boolean,
      timeSpentSec: (r.time_spent_sec as number) ?? 0,
    })),
  }
}

/**
 * Which of these questions may be written right now: those in the section the
 * server has open, plus one whose timer ran out within the last few seconds
 * (EXPIRY_GRACE_MS in lib/attempt.ts), so an answer already on its way is not
 * lost. The client's idea of which section it is in is never consulted
 * (FR-6.4.7).
 *
 * Deliberately cheap — one query on top of the core read — because it runs on
 * every save.
 */
export async function writableQuestions(
  core: AttemptCore, questionIds: string[], now = new Date(),
): Promise<{ status: AttemptStatus; allowed: Set<string> }> {
  const status = attemptStatus(core.rows, now, core.hardStop)
  const sectionIds = [...writablePositions(core.rows, now, core.hardStop)]
    .map((p) => core.idByPosition.get(p)).filter((id): id is string => Boolean(id))
  if (!sectionIds.length || questionIds.length === 0) return { status, allowed: new Set() }
  const { data, error } = await db()
    .from('questions').select('id')
    .in('section_id', sectionIds)
    .in('id', questionIds)
  if (error) throw new Error(`Could not check the questions: ${error.message}`)
  return { status, allowed: new Set((data ?? []).map((q) => q.id as string)) }
}

export interface ResponseWrite {
  questionId: string
  selectedOption: OptionLabel | null
  isMarked: boolean
  /** Total seconds spent on the question so far — a running total, not an increment, so a retried write is harmless. */
  timeSpentSec: number
}

/** No question can take longer than the longest section. */
const MAX_QUESTION_SEC = 12 * 60

/**
 * Record that questions were opened, answered or flagged.
 *
 * The row is written the moment a question is opened, with no option chosen.
 * That is what makes "not reached" distinguishable from "skipped" (FR-9.1).
 * The client sends each question's whole state rather than a patch, so a
 * retried or reordered write converges on the same row.
 */
export async function recordResponses(attemptId: string, items: ResponseWrite[]): Promise<void> {
  if (items.length === 0) return
  const now = Date.now()
  const { error } = await db().from('responses').upsert(
    items.map((it, i) => ({
      attempt_id: attemptId,
      question_id: it.questionId,
      selected_option: it.selectedOption,
      is_marked: it.isMarked,
      was_visited: true,
      time_spent_sec: Math.min(MAX_QUESTION_SEC, Math.max(0, Math.round(it.timeSpentSec))),
      // Staggered by a millisecond so the last item — the question the student
      // is on — is the newest, which is what resume reads.
      updated_at: new Date(now + i).toISOString(),
    })),
    { onConflict: 'attempt_id,question_id' },
  )
  if (error) throw new Error(`Could not save that response: ${error.message}`)
}

/** Incremented in place in the database (FR-6.5.4), so no bump is lost. */
export async function bumpIntegrityCounter(
  attemptId: string, which: 'fullscreen_exits' | 'tab_switches',
): Promise<void> {
  const { error } = await db().rpc('bump_attempt_counter', { p_attempt: attemptId, p_which: which })
  if (error) throw new Error(`Could not record that: ${error.message}`)
}

/**
 * Close the open section early and open the next (FR-6.4.3).
 *
 * `expectedPosition` is the section the student confirmed leaving. If that
 * section is no longer the open one — its timer expired first, or a repeated
 * click already moved on — this does nothing, so one confirmation can never
 * skip a section the student has not seen.
 */
export interface NextSectionResult {
  finished: boolean
  /** How to record the finish: the student's own choice, or time running out. */
  submitAs?: 'SUBMITTED' | 'AUTO_SUBMITTED'
}

export async function moveToNextSection(
  core: AttemptCore, expectedPosition: number,
): Promise<NextSectionResult> {
  const now = new Date()
  const rows = await closeExpiredSections(core, now)
  const status = attemptStatus(rows, now, core.hardStop)
  if (status.finished) return { finished: true, submitAs: 'AUTO_SUBMITTED' }
  if (status.currentPosition !== expectedPosition) return { finished: false }

  const { closed, opened } = advanceSection(rows, now, 'SUBMITTED')
  if (!closed) return { finished: true, submitAs: 'AUTO_SUBMITTED' }

  // Close first, conditionally, and open the next only if our close landed; a
  // racing request that got there first has already opened it.
  const client = db()
  const { data: landed } = await client.from('attempt_sections')
    .update({ ended_at: now.toISOString(), end_reason: 'SUBMITTED' })
    .eq('attempt_id', core.id).eq('section_id', core.idByPosition.get(closed.position)).is('ended_at', null)
    .select('section_id')
  if (!landed?.length) return { finished: false }
  if (!opened) return { finished: true, submitAs: 'SUBMITTED' }

  await client.from('attempt_sections')
    .update({ started_at: now.toISOString() })
    .eq('attempt_id', core.id).eq('section_id', core.idByPosition.get(opened.position)).is('started_at', null)
  return { finished: false }
}

/**
 * Score the attempt and close it.
 *
 * Idempotent: the state flip is conditional on IN_PROGRESS, so when the 00:05
 * job and a student's own End Test race, exactly one of them scores the paper
 * and the other finds nothing to do.
 */
export async function submitAttempt(
  attemptId: string, reason: 'SUBMITTED' | 'AUTO_SUBMITTED',
): Promise<void> {
  const client = db()
  const core = await loadAttemptCore(attemptId)
  if (!core) throw new Error('That attempt does not exist.')
  if (core.state !== 'IN_PROGRESS') return

  const { data: rows, error: readError } = await client
    .from('responses')
    .select('selected_option, was_visited, questions(number)')
    .eq('attempt_id', attemptId)
  // Scoring from a failed read would record every answer as not reached, and
  // a submitted score is final. Fail instead; the attempt stays open and the
  // next read, or the nightly job, scores it properly.
  if (readError) throw new Error(`Could not read the answers to score them: ${readError.message}`)
  const responses: ResponseInput[] = (rows ?? []).map((r) => ({
    questionNumber: (r.questions as unknown as { number: number }).number,
    selectedOption: (r.selected_option as OptionLabel | null) ?? null,
    wasVisited: r.was_visited as boolean,
  }))

  const now = new Date()
  // Each section closes at its own deadline, not at the moment someone noticed.
  const progress = closeForSubmit(core.rows, now, core.hardStop, reason)

  // Scored against the keys as read; finish_attempt refuses the score if a key
  // correction landed in between, and it is scored again against the new one.
  for (let tries = 0; tries < 3; tries++) {
    const record = await getPaperById(core.testId)
    if (!record) throw new Error('That paper no longer exists.')
    const score = scoreAttempt(record.paper, responses)

    const { data: outcome, error } = await client.rpc('finish_attempt', {
      p_attempt: attemptId,
      p_state: reason,
      p_key_version: record.keyVersion,
      p_score: {
        total_score: score.totalScore,
        section_scores: score.sections,
        attempted: score.attempted,
        correct: score.correct,
        wrong: score.wrong,
        skipped: score.skipped,
        not_reached: score.notReached,
        time_spent_sec: timeSpentSec(progress),
      },
    })
    if (error) throw new Error(`Could not submit the attempt: ${error.message}`)
    // Someone else finished it between our read and our write.
    if (outcome === 'done') return
    if (outcome === 'ok') {
      // After the state flip, so only the winner writes the final section record.
      await writeSectionChanges(core, core.rows, progress)
      return
    }
  }
  throw new Error('An answer key was being corrected while this attempt was scored. It will be scored on the next read.')
}

export type { PaperQuestion }
