import 'server-only'
import { deletePaperImages } from './images'
import { selectAll } from './select-all'
import { db } from '../supabase/admin'

/** The three columns every window needs, and the shape the app uses. */
export const PAPER_WINDOW_COLUMNS = 'date, opens_at_min, entry_closes_at_min'

export function paperWindowOf(row: Record<string, unknown>): PaperWindow {
  return {
    date: row['date'] as string,
    opensAtMin: row['opens_at_min'] as number,
    entryClosesAtMin: row['entry_closes_at_min'] as number,
  }
}
import { paperToRows, rowsToPaper, savePaperPayload, type PaperRows } from '../paper-rows'
import { readQuestion, summarise } from '../paper'
import {
  defaultPaperWindow, istDate, istMinuteOfDay, paperWindowProblem, windowState, windowsOverlap,
  opensAt, paperLabels, type PaperWindow, type WindowState,
} from '../time'
import { getWindow } from './settings'
import { OPTION_LABELS, type Issue, type OptionLabel, type Paper, type SectionCode } from '../types'

/**
 * Reading and writing papers.
 *
 * Supabase exposes no client-side transaction, so writing a paper is one call
 * to a database function that does it all or nothing. A half-written paper
 * would be far worse than a failed upload: it would go live at 10 PM with
 * questions missing.
 *
 * Attempts cascade from tests too, so anything that removes or unschedules a
 * paper first checks, through paperLock, that no student has sat it.
 */

export interface PaperSummary {
  id: string
  date: string
  title: string | null
  status: 'DRAFT' | 'SCHEDULED'
  questionCount: number
  /** Its own window, since a day may hold more than one paper. */
  window: PaperWindow
}

export interface PaperRecord {
  id: string
  status: string
  /** Its own window, since a day may hold more than one paper. */
  window: PaperWindow
  publishedAt: string | null
  rescoredAt: string | null
  /** Bumped by every key correction; see finish_attempt in schema.sql. */
  keyVersion: number
  paper: Paper
}

export interface SaveResult {
  id: string
  /** True when an existing draft for the same date was replaced. */
  replacedDraft: boolean
  /** The replaced draft's id, so its images can be removed. */
  replacedId?: string
}

export async function savePaper(paper: Paper): Promise<SaveResult> {
  // One transaction in the database (save_paper in supabase/schema.sql):
  // either the whole paper is written, replacing a draft for the same date, or
  // nothing changes. A scheduled paper, or a draft students have sat, is
  // refused there, where no race can slip past the check.
  const { data, error } = await db().rpc('save_paper', { p: savePaperPayload(paperToRows(paper)) })
  if (error) {
    if (/DATE_SCHEDULED/.test(error.message)) {
      throw new Error(`A paper is already scheduled for ${paper.date}. Move it back to draft first, or pick another date.`)
    }
    if (/DRAFT_HAS_ATTEMPTS/.test(error.message)) {
      throw new Error(`The draft for ${paper.date} already has student attempts, so it cannot be replaced. Pick another date.`)
    }
    throw new Error(`Could not save the paper, so nothing was changed: ${error.message}`)
  }
  const result = data as { id: string; replaced_id: string | null }
  return {
    id: result.id,
    replacedDraft: result.replaced_id !== null,
    ...(result.replaced_id ? { replacedId: result.replaced_id } : {}),
  }
}

export async function getPaperById(id: string): Promise<PaperRecord | null> {
  const { data: test, error } = await db()
    .from('tests')
    .select(`id, title, status, published_at, rescored_at, key_version, ${PAPER_WINDOW_COLUMNS}`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Could not load the paper: ${error.message}`)
  if (!test) return null
  return {
    id: test.id as string,
    status: test.status as string,
    window: paperWindowOf(test),
    publishedAt: (test.published_at as string | null) ?? null,
    rescoredAt: (test.rescored_at as string | null) ?? null,
    keyVersion: (test.key_version as number) ?? 0,
    paper: await loadPaper(test),
  }
}

async function loadPaper(test: Record<string, unknown>): Promise<Paper> {
  const client = db()
  const testId = test['id'] as string

  const { data: sections, error: sectionError } = await client
    .from('sections')
    .select('id, code, position, duration_sec, marks_correct, marks_negative, question_count')
    .eq('test_id', testId)
    .order('position')

  const sectionIds = (sections ?? []).map((s) => s.id as string)
  const { data: blocks, error: blockError } = await client
    .from('direction_blocks')
    .select('section_id, q_from, q_to, content, table_data, image_paths')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('q_from')

  const { data: questions, error: questionError } = await client
    .from('questions')
    .select('section_id, number, text, options, correct_option, solution, tag, difficulty, image_paths')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('number')

  const failed = sectionError ?? blockError ?? questionError
  if (failed) throw new Error(`Could not load the paper: ${failed.message}`)
  return assemble(test, sections ?? [], blocks ?? [], questions ?? [])
}

/** Rows for one paper, as read from the database, back into the paper format. */
function assemble(
  test: Record<string, unknown>,
  sections: Record<string, unknown>[],
  blocks: Record<string, unknown>[],
  questions: Record<string, unknown>[],
): Paper {
  const ordered = [...sections].sort((a, b) => (a['position'] as number) - (b['position'] as number))
  const codeById = new Map(ordered.map((s) => [s['id'] as string, s['code'] as SectionCode]))
  const rows: PaperRows = {
    test: {
      date: test['date'] as string,
      title: (test['title'] as string | null) ?? null,
      status: test['status'] as 'DRAFT' | 'SCHEDULED',
    },
    sections: ordered.map((s) => ({
      code: s['code'] as SectionCode,
      position: s['position'] as number,
      duration_sec: s['duration_sec'] as number,
      marks_correct: Number(s['marks_correct']),
      marks_negative: Number(s['marks_negative']),
      question_count: s['question_count'] as number,
    })),
    directionBlocks: [...blocks].sort((a, b) => (a['q_from'] as number) - (b['q_from'] as number)).map((b) => ({
      sectionCode: codeById.get(b['section_id'] as string)!,
      q_from: b['q_from'] as number,
      q_to: b['q_to'] as number,
      content: b['content'] as string,
      table_data: b['table_data'],
      image_paths: (b['image_paths'] as string[]) ?? [],
    })),
    questions: [...questions].sort((a, b) => (a['number'] as number) - (b['number'] as number)).map((q) => ({
      sectionCode: codeById.get(q['section_id'] as string)!,
      number: q['number'] as number,
      text: q['text'] as string,
      options: q['options'] as Record<string, string>,
      correct_option: q['correct_option'] as string,
      solution: (q['solution'] as string | null) ?? null,
      tag: (q['tag'] as string | null) ?? null,
      difficulty: (q['difficulty'] as string | null) ?? null,
      image_paths: (q['image_paths'] as string[]) ?? [],
    })),
  }
  return rowsToPaper(rows)
}

/**
 * Every published paper, whole, for the question-bank export (FR-6.9.5).
 *
 * Four paged reads in all, filtered through joins, rather than four per paper:
 * after a year of nightly papers a per-paper loop would outlast the request.
 */
export async function loadPublishedPapers(): Promise<PaperRecord[]> {
  const client = db()
  const tests = await selectAll<Record<string, unknown>>('papers', (from, to) =>
    client.from('tests').select('id, date, title, status, published_at, rescored_at, key_version')
      .eq('status', 'SCHEDULED').order('date').range(from, to))
  if (!tests.length) return []

  const [sections, blocks, questions] = await Promise.all([
    selectAll<Record<string, unknown>>('sections', (from, to) =>
      client.from('sections')
        .select('id, test_id, code, position, duration_sec, marks_correct, marks_negative, question_count, tests!inner(status)')
        .eq('tests.status', 'SCHEDULED').order('id').range(from, to)),
    selectAll<Record<string, unknown>>('directions', (from, to) =>
      client.from('direction_blocks')
        .select('id, section_id, q_from, q_to, content, table_data, image_paths, sections!inner(tests!inner(status))')
        .eq('sections.tests.status', 'SCHEDULED').order('id').range(from, to)),
    selectAll<Record<string, unknown>>('questions', (from, to) =>
      client.from('questions')
        .select('id, section_id, number, text, options, correct_option, solution, tag, difficulty, image_paths, sections!inner(tests!inner(status))')
        .eq('sections.tests.status', 'SCHEDULED').order('id').range(from, to)),
  ])

  const sectionById = new Map(sections.map((s) => [s['id'] as string, s]))
  const byTest = new Map<string, { sections: Record<string, unknown>[]; blocks: Record<string, unknown>[]; questions: Record<string, unknown>[] }>()
  for (const t of tests) byTest.set(t['id'] as string, { sections: [], blocks: [], questions: [] })
  for (const sec of sections) byTest.get(sec['test_id'] as string)?.sections.push(sec)
  for (const b of blocks) byTest.get(sectionById.get(b['section_id'] as string)?.['test_id'] as string)?.blocks.push(b)
  for (const q of questions) byTest.get(sectionById.get(q['section_id'] as string)?.['test_id'] as string)?.questions.push(q)

  return tests.map((t) => {
    const parts = byTest.get(t['id'] as string)!
    return {
      id: t['id'] as string,
      status: t['status'] as string,
      window: paperWindowOf(t),
      publishedAt: (t['published_at'] as string | null) ?? null,
      rescoredAt: (t['rescored_at'] as string | null) ?? null,
      keyVersion: (t['key_version'] as number) ?? 0,
      paper: assemble(t, parts.sections, parts.blocks, parts.questions),
    }
  })
}

export async function listPapers(): Promise<PaperSummary[]> {
  const { data, error } = await db()
    .from('tests')
    .select(`id, title, status, sections(question_count), ${PAPER_WINDOW_COLUMNS}`)
    .order('date', { ascending: false })
    .order('opens_at_min', { ascending: false })
  if (error) throw new Error(`Could not list the papers: ${error.message}`)

  return (data ?? []).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    title: (t.title as string | null) ?? null,
    status: t.status as 'DRAFT' | 'SCHEDULED',
    questionCount: ((t.sections ?? []) as { question_count: number }[])
      .reduce((a, s) => a + s.question_count, 0),
    window: paperWindowOf(t),
  }))
}

/** Dates that already hold a scheduled paper, for the upload's DATE_TAKEN check. */
export async function scheduledDates(): Promise<string[]> {
  const { data, error } = await db().from('tests').select('date').eq('status', 'SCHEDULED')
  if (error) throw new Error(`Could not check which dates are taken: ${error.message}`)
  return (data ?? []).map((t) => t.date as string)
}

async function countRealAttempts(testId: string): Promise<number> {
  const { count, error } = await db()
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId)
    .eq('is_dry_run', false)
  if (error) throw new Error(`Could not count attempts: ${error.message}`)
  return count ?? 0
}

/**
 * What may still be done to a paper without losing anything.
 *
 * Attempts cascade from tests, so deleting a paper a student has sat deletes
 * their result, and unscheduling one that has opened pulls it out from under
 * them. Both are refused once the window has opened or a real attempt exists.
 * A draft never goes live, so only its attempts matter. Dry runs are the
 * admin's own and may go with the paper (FR-6.9.2).
 */
export interface PaperLock {
  date: string
  status: 'DRAFT' | 'SCHEDULED'
  state: WindowState
  realAttempts: number
  canSchedule: boolean
  canUnschedule: boolean
  canDelete: boolean
  /** Why unscheduling or deleting is refused, for the UI and the error. */
  reason: string | null
}

export async function paperLock(id: string): Promise<PaperLock | null> {
  const { data: test, error } = await db()
    .from('tests').select('date, status, opens_at_min, entry_closes_at_min').eq('id', id).maybeSingle()
  if (error) throw new Error(`Could not load the paper: ${error.message}`)
  if (!test) return null

  const date = test.date as string
  const status = test.status as 'DRAFT' | 'SCHEDULED'
  const state = windowState({
    date,
    opensAtMin: test.opens_at_min as number,
    entryClosesAtMin: test.entry_closes_at_min as number,
  })
  const realAttempts = await countRealAttempts(id)
  const opened = state !== 'BEFORE_OPEN'

  const reason =
    realAttempts > 0
      ? `${realAttempts} student${realAttempts === 1 ? ' has' : 's have'} sat this paper, so it cannot be removed or unscheduled. Correct it question by question instead.`
      : status === 'SCHEDULED' && opened
        ? 'This paper has already gone live, so it cannot be removed or unscheduled.'
        : null

  return {
    date,
    status,
    state,
    realAttempts,
    // Any draft: the admin assigns the night when scheduling it.
    canSchedule: status === 'DRAFT',
    canUnschedule: status === 'SCHEDULED' && !opened && realAttempts === 0,
    canDelete: realAttempts === 0 && (status === 'DRAFT' || !opened),
    reason,
  }
}

/**
 * The write-time half of the `canUnschedule` / `canDelete` checks: between
 * reading the lock and issuing the update, the paper's own window may have
 * opened. Matching on the date alone would miss that, because a paper opening
 * this morning still carries today's date -- so compare the opening minute too.
 */
function stillBeforeOpen<T extends { or: (f: string) => T }>(query: T): T {
  const today = istDate()
  const minute = istMinuteOfDay()
  return query.or(`date.gt.${today},and(date.eq.${today},opens_at_min.gt.${minute})`)
}

async function lockOrThrow(id: string): Promise<PaperLock> {
  const lock = await paperLock(id)
  if (!lock) throw new Error('That paper no longer exists.')
  return lock
}

/**
 * FR-6.9.1: a paper only ever becomes scheduled by an explicit admin action,
 * taken after the preview. "Assign a date": the admin may schedule it for a
 * different night than the file named, as long as that night has not opened
 * and holds no other paper.
 */
export async function schedulePaper(
  id: string, adminId: string, date?: string, times?: { opensAtMin: number; entryClosesAtMin: number },
): Promise<void> {
  const lock = await lockOrThrow(id)
  if (lock.status !== 'DRAFT') throw new Error('This paper is already scheduled.')
  const target = date ?? lock.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || Number.isNaN(Date.parse(`${target}T00:00:00Z`))) {
    throw new Error(`${target} is not a date.`)
  }

  const fallback = defaultPaperWindow(target, await getWindow())
  const window: PaperWindow = {
    date: target,
    opensAtMin: times?.opensAtMin ?? fallback.opensAtMin,
    entryClosesAtMin: times?.entryClosesAtMin ?? fallback.entryClosesAtMin,
  }

  const problem = paperWindowProblem(window)
  if (problem) throw new Error(problem)

  if (windowState(window) !== 'BEFORE_OPEN') {
    throw new Error(
      `That window has already opened, so a paper can no longer be scheduled for it. Pick a later time or another day.`,
    )
  }

  // A student may only sit one paper at a time, so two overlapping windows on
  // one day would force a choice rather than offer one.
  const clash = await overlappingPaper(window, id)
  if (clash) {
    throw new Error(
      `This overlaps ${clash.title ?? 'another paper'} on the same day, which runs ${clash.labels}. `
      + `A student can only sit one paper at a time, so pick a window that does not overlap.`,
    )
  }

  // The status filter repeats the check above in the write itself, so a paper
  // that changed in between is not touched.
  const { data, error } = await db()
    .from('tests')
    .update({
      date: target,
      opens_at_min: window.opensAtMin,
      entry_closes_at_min: window.entryClosesAtMin,
      status: 'SCHEDULED',
      published_by: adminId,
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'DRAFT')
    .select('id')
  if (error) {
    if (error.code === '23505') {
      throw new Error(`Another paper already opens at that exact time on ${target}. Pick a different time.`)
    }
    throw new Error(`Could not schedule the paper: ${error.message}`)
  }
  if (!data?.length) throw new Error('The paper changed while you were looking at it. Reload and try again.')
}

/** A scheduled paper on the same day whose window overlaps this one. */
async function overlappingPaper(
  window: PaperWindow, excludeId: string,
): Promise<{ title: string | null; labels: string } | null> {
  const { data } = await db()
    .from('tests')
    .select('id, title, date, opens_at_min, entry_closes_at_min')
    .eq('date', window.date).eq('status', 'SCHEDULED').neq('id', excludeId)

  for (const t of data ?? []) {
    const other: PaperWindow = {
      date: t.date as string,
      opensAtMin: t.opens_at_min as number,
      entryClosesAtMin: t.entry_closes_at_min as number,
    }
    if (windowsOverlap(window, other)) {
      const l = paperLabels(other)
      return { title: (t.title as string | null) ?? null, labels: `${l.opens} to ${l.hardStop}` }
    }
  }
  return null
}

export async function unschedulePaper(id: string): Promise<void> {
  const lock = await lockOrThrow(id)
  if (lock.status !== 'SCHEDULED') throw new Error('This paper is already a draft.')
  if (!lock.canUnschedule) throw new Error(lock.reason ?? 'This paper can no longer be unscheduled.')
  const { data, error } = await stillBeforeOpen(
    db()
      .from('tests')
      .update({ status: 'DRAFT', published_by: null, published_at: null })
      .eq('id', id),
  )
    .eq('status', 'SCHEDULED')
    .select('id')
  if (error) throw new Error(`Could not move the paper back to draft: ${error.message}`)
  if (!data?.length) throw new Error('The paper changed while you were looking at it. Reload and try again.')
}

export async function deletePaper(id: string): Promise<void> {
  const lock = await lockOrThrow(id)
  if (!lock.canDelete) throw new Error(lock.reason ?? 'This paper can no longer be deleted.')
  let query = db().from('tests').delete().eq('id', id)
  if (lock.status === 'SCHEDULED') query = stillBeforeOpen(query)
  const { data, error } = await query.select('id')
  if (error) throw new Error(`Could not delete the paper: ${error.message}`)
  if (!data?.length) throw new Error('The paper opened while you were looking at it, so it was kept.')
  await deletePaperImages(id)
}

export interface QuestionEdit {
  text: string
  options: Partial<Record<OptionLabel, string>>
  solution: string
}

export interface QuestionEditResult {
  number: number
  /** Blocking errors mean nothing was written. */
  issues: Issue[]
}

/**
 * Corrects a question's text, options or solution after publication
 * (PRD 6.9: "edit any of them after publication").
 *
 * The edited question is run through the same per-question rules as an
 * upload before anything is written. The set of option letters and the key
 * stay as they are: a changed key must go through correctAnswerKey, which
 * rescores, and adding or removing a letter would silently change what an
 * existing response means.
 */
export async function updateQuestionContent(
  testId: string,
  questionId: string,
  edit: QuestionEdit,
): Promise<QuestionEditResult> {
  const client = db()
  const { data: q, error } = await client
    .from('questions')
    .select('id, number, options, correct_option, tag, difficulty, image_paths, sections!inner(code, test_id)')
    .eq('id', questionId)
    .eq('sections.test_id', testId)
    .maybeSingle()
  if (error) throw new Error(`Could not load the question: ${error.message}`)
  if (!q) throw new Error('That question is not part of this paper.')

  const section = q.sections as unknown as { code: SectionCode }
  const current = q.options as Record<string, string>
  const labels = OPTION_LABELS.filter((l) => current[l] !== undefined)
  const options = Object.fromEntries(labels.map((l) => [l, (edit.options[l] ?? '').trim()]))
  const text = edit.text.trim()
  const solution = edit.solution.trim()
  const images = (q.image_paths as string[] | null) ?? []

  const candidate = {
    number: q.number as number,
    text,
    options,
    answer: q.correct_option as string,
    ...(solution ? { solution } : {}),
    ...(q.tag ? { tag: q.tag as string } : {}),
    ...(q.difficulty ? { difficulty: q.difficulty as string } : {}),
    ...(images.length ? { images } : {}),
  }
  const issues = readQuestion(candidate, section.code, { availableImages: images })
  if (!summarise(issues).publishable) return { number: candidate.number, issues }

  const { error: updateError } = await client
    .from('questions')
    .update({ text, options, solution: solution || null })
    .eq('id', questionId)
  if (updateError) throw new Error(`Could not save the question: ${updateError.message}`)
  return { number: candidate.number, issues }
}


/**
 * The next scheduled paper still to open, and the one open right now.
 *
 * With a window per paper and more than one possible in a day, "tonight's
 * paper" is no longer a date lookup: it is whichever scheduled paper the clock
 * currently sits inside, and whichever opens soonest after that.
 */
export interface UpcomingPapers {
  /** Open for entry now, or running with entry closed. */
  live: { id: string; title: string | null; window: PaperWindow; state: WindowState } | null
  /** The soonest paper that has not opened yet. */
  next: { id: string; title: string | null; window: PaperWindow } | null
}

export async function upcomingPapers(now = new Date()): Promise<UpcomingPapers> {
  const today = istDate(now)
  // Today and later is the whole of it: `tests_window_within_the_day` forces
  // entry close + 45 minutes to land inside the paper's own IST day, so no
  // paper dated before today can still be running.
  const rows = await selectAll<Record<string, unknown>>('papers', (from, to) =>
    db().from('tests').select(`id, title, ${PAPER_WINDOW_COLUMNS}`)
      .eq('status', 'SCHEDULED')
      .gte('date', today)
      .order('date').range(from, to))

  const papers = rows
    .map((r) => ({ id: r['id'] as string, title: (r['title'] as string | null) ?? null, window: paperWindowOf(r) }))
    .sort((a, b) => opensAt(a.window).getTime() - opensAt(b.window).getTime())

  let live: UpcomingPapers['live'] = null
  let next: UpcomingPapers['next'] = null

  for (const p of papers) {
    const state = windowState(p.window, now)
    if ((state === 'OPEN' || state === 'ENTRY_CLOSED') && !live) live = { ...p, state }
    if (state === 'BEFORE_OPEN' && !next) next = p
  }
  return { live, next }
}
