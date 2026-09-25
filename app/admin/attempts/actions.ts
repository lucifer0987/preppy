'use server'

import { revalidatePath } from 'next/cache'
import { currentUser } from '../../../lib/auth'
import { voidAttempt } from '../../../lib/repo/attempt-admin'

export async function voidAttemptAction(formData: FormData) {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Not authorised.')
  await voidAttempt(String(formData.get('attemptId')))
  revalidatePath('/admin/attempts')
  revalidatePath('/leaderboard')
}
