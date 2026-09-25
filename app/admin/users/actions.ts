'use server'

import { revalidatePath } from 'next/cache'
import { currentUser } from '../../../lib/auth'
import { createUser, resetPassword, setActive } from '../../../lib/repo/users'

async function requireAdmin() {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Not authorised.')
  return admin
}

import type { UserActionState } from './state'

export async function createUserAction(
  _prev: UserActionState, formData: FormData,
): Promise<UserActionState> {
  try {
    await requireAdmin()
    const credential = await createUser(
      String(formData.get('username') ?? ''),
      String(formData.get('displayName') ?? ''),
      formData.get('role') === 'admin' ? 'admin' : 'student',
    )
    revalidatePath('/admin/users')
    return { error: null, credential }
  } catch (e) {
    return { error: (e as Error).message, credential: null }
  }
}

export async function resetPasswordAction(
  _prev: UserActionState, formData: FormData,
): Promise<UserActionState> {
  try {
    await requireAdmin()
    const credential = await resetPassword(String(formData.get('userId')))
    revalidatePath('/admin/users')
    return { error: null, credential }
  } catch (e) {
    return { error: (e as Error).message, credential: null }
  }
}

export async function toggleActiveAction(formData: FormData) {
  const admin = await requireAdmin()
  const userId = String(formData.get('userId'))
  if (userId === admin.id) throw new Error('You cannot deactivate your own account.')
  await setActive(userId, formData.get('isActive') === 'true')
  revalidatePath('/admin/users')
}
