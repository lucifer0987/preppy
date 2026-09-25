'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { deleteDryRun, voidAttempt } from '../../../lib/repo/attempt-admin'

/** Back to the list the admin was looking at, with what happened. */
async function run(formData: FormData, work: (id: string) => Promise<void>, done: string) {
  if (!(await actionAdmin())) redirect('/login')
  const back = String(formData.get('back') ?? '/admin/attempts')
  const safeBack = back.startsWith('/admin/attempts') ? back : '/admin/attempts'
  const sep = safeBack.includes('?') ? '&' : '?'
  let failure: string | null = null
  try {
    await work(String(formData.get('attemptId')))
  } catch (e) {
    failure = (e as Error).message
  }
  revalidatePath('/admin/attempts')
  revalidatePath('/leaderboard')
  redirect(`${safeBack}${sep}${failure ? `error=${encodeURIComponent(failure)}` : `done=${done}`}`)
}

export async function voidAttemptAction(formData: FormData) {
  await run(formData, voidAttempt, 'voided')
}

export async function deleteDryRunAction(formData: FormData) {
  await run(formData, deleteDryRun, 'deleted')
}
