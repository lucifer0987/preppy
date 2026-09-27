'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../../lib/guard'
import {
  deletePaper, endPaperNow, retimePaper, schedulePaper, unschedulePaper, updateQuestionContent,
} from '../../../../lib/repo/papers'
import { correctAnswerKey, setSectionMarks } from '../../../../lib/repo/rescore'
import { OPTION_LABELS, SECTION_CODES, type OptionLabel, type SectionCode } from '../../../../lib/types'
import type { EditState } from './edit-state'

/**
 * The repository re-checks every state rule (window, attempts, status), so a
 * stale page or a hand-built request cannot do what the buttons would not
 * offer. A refusal comes back to the page as ?error=, not as a crash.
 */
async function run(id: string, work: () => Promise<void>, onSuccess: string, onFailure?: string) {
  let failure: string | null = null
  try {
    await work()
  } catch (e) {
    failure = (e as Error).message
  }
  revalidatePath('/admin')
  revalidatePath('/admin/papers')
  revalidatePath('/dashboard')
  // redirect() throws, so it stays outside the try.
  if (failure) {
    const back = onFailure ?? `/admin/papers/${id}`
    redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(failure)}`)
  }
  redirect(onSuccess)
}

export async function scheduleAction(formData: FormData) {
  const admin = await actionAdmin()
  if (!admin) redirect('/login')
  const id = String(formData.get('id'))
  // The preview cannot be skipped (FR-6.9.1): the form sits after the last
  // question and must say it was read.
  if (formData.get('reviewed') !== 'yes') {
    redirect(`/admin/papers/${id}?error=${encodeURIComponent('Tick the box to confirm you have read the paper through.')}`)
  }
  const date = String(formData.get('date') ?? '') || undefined

  // "HH:MM" from two time inputs, as minutes from midnight.
  const minutes = (name: string): number | null => {
    const parts = String(formData.get(name) ?? '').split(':').map(Number)
    const [h, m] = [parts[0] ?? NaN, parts[1] ?? NaN]
    return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null
  }
  const opensAtMin = minutes('opensAt')
  const entryClosesAtMin = minutes('entryClosesAt')
  const times = opensAtMin !== null && entryClosesAtMin !== null
    ? { opensAtMin, entryClosesAtMin }
    : undefined

  // Scheduling is the end of the job, so it lands back on the list rather than
    // on the paper you have just finished with.
    await run(id, () => schedulePaper(id, admin.id, date, times), '/admin/papers?scheduled=1')
}

export async function unscheduleAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const id = String(formData.get('id'))
  await run(id, () => unschedulePaper(id), `/admin/papers/${id}`)
}

export async function deleteAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const id = String(formData.get('id'))
  // `force` comes only from the screen that has already said, in figures, how
  // many attempts go with the paper.
  const force = formData.get('force') === 'yes'
  await run(id, () => deletePaper(id, { force }), '/admin/papers')
}

/** "HH:MM" from a time picker, as minutes from midnight, or null. */
function minutesOf(formData: FormData, name: string): number | null {
  const parts = String(formData.get(name) ?? '').split(':').map(Number)
  const [h, m] = [parts[0] ?? NaN, parts[1] ?? NaN]
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null
}

/**
 * Moving a live paper's window: the flexible half of managing one.
 *
 * Its usual use is giving somebody longer to start. Moving entry close also
 * moves the hard stop, so whoever starts at the new last moment still gets the
 * whole paper.
 */
export async function retimeAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const id = String(formData.get('id'))
  const entryClosesAtMin = minutesOf(formData, 'entryClosesAt')
  const opensAtMin = minutesOf(formData, 'opensAt')
  if (entryClosesAtMin === null) {
    redirect(`/admin/papers/${id}/manage?error=${encodeURIComponent('Pick a last moment to start.')}`)
  }
  await run(
    id,
    () => retimePaper(id, { entryClosesAtMin, ...(opensAtMin === null ? {} : { opensAtMin }) }),
    `/admin/papers/${id}/manage?done=retimed`,
    `/admin/papers/${id}/manage`,
  )
}

/**
 * Ending a paper for everybody, now.
 *
 * The stamp lands first, so nobody starts one in the gap, and every attempt
 * still running is then closed and scored where it stands.
 */
export async function endNowAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const id = String(formData.get('id'))
  let closed = 0
  let stuck = 0
  let failure: string | null = null
  try {
    const report = await endPaperNow(id)
    closed = report.finalised
    // An attempt the sweep could not score is the one thing here that leaves
    // the paper and its attempts disagreeing, so it is reported rather than
    // rounded down to "done".
    stuck = report.failed
  } catch (e) {
    failure = (e as Error).message
  }
  revalidatePath('/admin')
  revalidatePath('/admin/papers')
  revalidatePath('/leaderboard')
  revalidatePath('/dashboard')
  if (failure) redirect(`/admin/papers/${id}/manage?error=${encodeURIComponent(failure)}`)
  redirect(`/admin/papers/${id}/manage?done=ended&closed=${closed}&stuck=${stuck}`)
}

/**
 * Changing what a section's questions are worth, after which every finished
 * attempt is scored again -- so the board never disagrees with the marking.
 */
export async function setMarksAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const id = String(formData.get('id'))
  const marks = SECTION_CODES
    .filter((code) => formData.has(`${code}.correct`))
    .map((code: SectionCode) => ({
      code,
      marksCorrect: Number(formData.get(`${code}.correct`)),
      marksNegative: Number(formData.get(`${code}.wrong`)),
    }))

  let moved = 0
  let rescored = 0
  let failure: string | null = null
  try {
    if (!marks.length) throw new Error('Nothing to save.')
    if (marks.some((m) => !Number.isFinite(m.marksCorrect) || !Number.isFinite(m.marksNegative))) {
      throw new Error('Every box needs a number.')
    }
    const report = await setSectionMarks(id, marks)
    moved = report.moved
    rescored = report.rescored
  } catch (e) {
    failure = (e as Error).message
  }
  revalidatePath(`/admin/papers/${id}`)
  revalidatePath('/leaderboard')
  if (failure) redirect(`/admin/papers/${id}/manage?error=${encodeURIComponent(failure)}`)
  redirect(`/admin/papers/${id}/manage?done=marks&moved=${moved}&of=${rescored}`)
}

/**
 * FR-6.9.2. Correcting a key rescores every attempt on the paper. The
 * leaderboard is computed on read, so there is nothing else to invalidate.
 */
export async function correctKeyAction(formData: FormData) {
  if (!(await actionAdmin())) redirect('/login')
  const testId = String(formData.get('testId'))
  const questionId = String(formData.get('questionId'))
  const answer = String(formData.get('answer')) as OptionLabel

  let report
  try {
    report = await correctAnswerKey(testId, questionId, answer)
  } catch (e) {
    redirect(`/admin/papers/${testId}?error=${encodeURIComponent((e as Error).message)}`)
  }
  revalidatePath(`/admin/papers/${testId}`)
  revalidatePath('/leaderboard')
  redirect(
    `/admin/papers/${testId}?rescored=${report.questionNumber}` +
    `&from=${report.from}&to=${report.to}&changed=${report.changed.length}&of=${report.attemptsRescored}`,
  )
}

/**
 * Correcting a question's wording, options or solution after publication.
 * Scores do not depend on any of these, so nothing is rescored.
 */
export async function editQuestionAction(_prev: EditState, formData: FormData): Promise<EditState> {
  if (!(await actionAdmin())) return { issues: [], fatal: 'Not authorised.', saved: false }
  const testId = String(formData.get('testId'))
  const questionId = String(formData.get('questionId'))

  try {
    const result = await updateQuestionContent(testId, questionId, {
      text: String(formData.get('text') ?? ''),
      options: Object.fromEntries(
        OPTION_LABELS.filter((l) => formData.has(`option-${l}`))
          .map((l) => [l, String(formData.get(`option-${l}`))]),
      ),
      solution: String(formData.get('solution') ?? ''),
    })
    const saved = !result.issues.some((i) => i.severity === 'error')
    if (saved) {
      revalidatePath(`/admin/papers/${testId}`)
      revalidatePath(`/archive/${testId}`)
    }
    return { issues: result.issues, fatal: null, saved }
  } catch (e) {
    return { issues: [], fatal: (e as Error).message, saved: false }
  }
}
