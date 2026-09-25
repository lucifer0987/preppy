'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { createUser, resetPassword, setActive } from '../../../lib/repo/users'
import { emptyBulk, type BulkState, type UserActionState } from './state'
import { MAX_BULK_ROWS, parseUserCsv } from '../../../lib/csv'

/**
 * Every action checks for itself (lib/guard.ts): an active admin who has
 * chosen their own password. The page's guard does not protect these.
 */
const NOT_AUTHORISED = 'Not authorised. Log in again as an admin.'

export async function createUserAction(
  _prev: UserActionState, formData: FormData,
): Promise<UserActionState> {
  if (!(await actionAdmin())) return { error: NOT_AUTHORISED, credential: null }
  try {
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
  if (!(await actionAdmin())) return { error: NOT_AUTHORISED, credential: null }
  try {
    const credential = await resetPassword(String(formData.get('userId')))
    revalidatePath('/admin/users')
    return { error: null, credential }
  } catch (e) {
    return { error: (e as Error).message, credential: null }
  }
}

export async function toggleActiveAction(formData: FormData) {
  const admin = await actionAdmin()
  if (!admin) throw new Error(NOT_AUTHORISED)
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
  if (!(await actionAdmin())) return { ...emptyBulk, error: NOT_AUTHORISED }

  const text = String(formData.get('csv') ?? '').trim()
  if (!text) return { ...emptyBulk, error: 'Paste some rows first.' }

  const { users, problems, warnings } = parseUserCsv(text)
  if (!users.length) {
    return { ...emptyBulk, error: 'No usable rows in that CSV.', problems, warnings }
  }
  // Each row is a round trip to Supabase Auth; a runaway paste would time the
  // action out halfway, leaving some accounts made and their passwords lost.
  if (users.length > MAX_BULK_ROWS) {
    return {
      ...emptyBulk, problems, warnings,
      error: `That is ${users.length} people. Import at most ${MAX_BULK_ROWS} at a time; split the file and run it in parts.`,
    }
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
  return { error: null, problems, warnings, created, failed }
}
