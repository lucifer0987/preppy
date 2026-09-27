'use server'

import { revalidatePath } from 'next/cache'
import { actionAdmin } from '../../../lib/guard'
import { defaultTrack } from '../../../lib/repo/tracks'
import { createUser, resetPassword, setActive, setDisplayName, setUserTrack } from '../../../lib/repo/users'
import { emptyBulk, type BulkState, type RenameState, type UserActionState } from './state'
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
    // With one exam the form shows no picker, so the account joins the only
    // one there is rather than being created with none and seeing nothing.
    const chosen = String(formData.get('trackId') ?? '') || (await defaultTrack())?.id || null
    const credential = await createUser(
      String(formData.get('username') ?? ''),
      String(formData.get('displayName') ?? ''),
      formData.get('role') === 'admin' ? 'admin' : 'student',
      chosen,
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

/**
 * Rename anyone, including another admin and yourself. The username is the
 * login and stays put; this is only the name people read.
 */
export async function renameUserAction(
  _prev: RenameState, formData: FormData,
): Promise<RenameState> {
  if (!(await actionAdmin())) return { error: NOT_AUTHORISED, savedName: null }
  try {
    const savedName = await setDisplayName(
      String(formData.get('userId') ?? ''),
      String(formData.get('displayName') ?? ''),
    )
    // The name is printed on the board and in every archive row, not just here.
    revalidatePath('/admin/users')
    revalidatePath('/leaderboard')
    return { error: null, savedName }
  } catch (e) {
    return { error: (e as Error).message, savedName: null }
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

  // Everyone in one paste joins the same exam. A CSV column for it would be
  // one more thing to get wrong in a file typed by hand, and a mixed import
  // is not something anybody has wanted.
  const bulkTrack = String(formData.get('trackId') ?? '') || (await defaultTrack())?.id || null

  const created: { username: string; password: string }[] = []
  const failed: { username: string; message: string }[] = []

  for (const u of users) {
    try {
      created.push(await createUser(u.username, u.displayName, u.role, bulkTrack))
    } catch (e) {
      failed.push({ username: u.username, message: (e as Error).message })
    }
  }

  revalidatePath('/admin/users')
  return { error: null, problems, warnings, created, failed }
}

/** Move a student to another exam, from the row they are already on. */
export async function setUserTrackAction(formData: FormData) {
  if (!(await actionAdmin())) return
  await setUserTrack(String(formData.get('userId')), String(formData.get('trackId')))
  revalidatePath('/admin/users')
  revalidatePath('/dashboard')
}
