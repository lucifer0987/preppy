'use server'

import { revalidatePath } from 'next/cache'
import { currentUser } from '../../../lib/auth'
import { createUser, resetPassword, setActive } from '../../../lib/repo/users'

async function requireAdmin() {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Not authorised.')
  return admin
}

import { emptyBulk, type BulkState, type UserActionState } from './state'
import { parseUserCsv } from '../../../lib/csv'

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

/**
 * Bulk create from CSV (PRD 6.9.3).
 *
 * Rows that cannot be read are reported with their line number rather than
 * skipped, and a row that fails to create does not stop the rest. Passwords
 * come back once, downloadable as a file, because there is no email to send
 * them to.
 */
export async function bulkCreateAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  try {
    await requireAdmin()
  } catch (e) {
    return { ...emptyBulk, error: (e as Error).message }
  }

  const text = String(formData.get('csv') ?? '').trim()
  if (!text) return { ...emptyBulk, error: 'Paste some rows first.' }

  const { users, problems } = parseUserCsv(text)
  if (!users.length) {
    return { ...emptyBulk, error: 'No usable rows in that CSV.', problems }
  }

  const created: { username: string; password: string }[] = []
  const failed: { username: string; message: string }[] = []

  for (const u of users) {
    try {
      created.push(await createUser(u.username, u.displayName, u.role))
    } catch (e) {
      failed.push({ username: u.username, message: (e as Error).message })
    }
  }

  revalidatePath('/admin/users')
  return { error: null, problems, created, failed }
}
