'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { currentUser } from '../../../../lib/auth'
import { deletePaper, schedulePaper, unschedulePaper } from '../../../../lib/repo/papers'
import { correctAnswerKey } from '../../../../lib/repo/rescore'
import type { OptionLabel } from '../../../../lib/types'

async function requireAdmin() {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Not authorised.')
  return admin
}

export async function scheduleAction(formData: FormData) {
  const admin = await requireAdmin()
  await schedulePaper(String(formData.get('id')), admin.id)
  revalidatePath('/admin')
  redirect(`/admin/papers/${formData.get('id')}?scheduled=1`)
}

export async function unscheduleAction(formData: FormData) {
  await requireAdmin()
  await unschedulePaper(String(formData.get('id')))
  revalidatePath('/admin')
  redirect(`/admin/papers/${formData.get('id')}`)
}

export async function deleteAction(formData: FormData) {
  await requireAdmin()
  await deletePaper(String(formData.get('id')))
  revalidatePath('/admin')
  redirect('/admin/papers')
}

/**
 * FR-6.9.2. Correcting a key rescores every attempt on the paper. The
 * leaderboard is computed on read, so there is nothing else to invalidate.
 */
export async function correctKeyAction(formData: FormData) {
  await requireAdmin()
  const testId = String(formData.get('testId'))
  const questionId = String(formData.get('questionId'))
  const answer = String(formData.get('answer')) as OptionLabel

  const report = await correctAnswerKey(testId, questionId, answer)
  revalidatePath(`/admin/papers/${testId}`)
  revalidatePath('/leaderboard')
  redirect(
    `/admin/papers/${testId}?rescored=${report.questionNumber}` +
    `&from=${report.from}&to=${report.to}&changed=${report.changed.length}&of=${report.attemptsRescored}`,
  )
}
