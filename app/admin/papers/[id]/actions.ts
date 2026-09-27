'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../../lib/guard'
import {
  deletePaper, schedulePaper, unschedulePaper, updateQuestionContent,
} from '../../../../lib/repo/papers'
import { correctAnswerKey } from '../../../../lib/repo/rescore'
import { OPTION_LABELS, type OptionLabel } from '../../../../lib/types'
import type { EditState } from './edit-state'

/**
 * The repository re-checks every state rule (window, attempts, status), so a
 * stale page or a hand-built request cannot do what the buttons would not
 * offer. A refusal comes back to the page as ?error=, not as a crash.
 */
async function run(id: string, work: () => Promise<void>, onSuccess: string) {
  let failure: string | null = null
  try {
    await work()
  } catch (e) {
    failure = (e as Error).message
  }
  revalidatePath('/admin')
  revalidatePath('/admin/papers')
  // redirect() throws, so it stays outside the try.
  if (failure) redirect(`/admin/papers/${id}?error=${encodeURIComponent(failure)}`)
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
  await run(id, () => deletePaper(id), '/admin/papers')
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
