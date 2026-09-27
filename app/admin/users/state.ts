/**
 * Shared action state.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions; a plain object export there is a build error.
 */
export interface UserActionState {
  error: string | null
  /** Shown once and never stored; there is no email to send it to. */
  credential: { username: string; password: string } | null
}

export const emptyUserAction: UserActionState = { error: null, credential: null }

export interface BulkState {
  error: string | null
  problems: { line: number; message: string; raw: string }[]
  /** Rows that were imported but had something odd about them. */
  warnings: { line: number; message: string; raw: string }[]
  created: { username: string; password: string }[]
  failed: { username: string; message: string }[]
}

export const emptyBulk: BulkState = { error: null, problems: [], warnings: [], created: [], failed: [] }

/** A rename reports back the name that was actually stored, trimmed. */
export interface RenameState {
  error: string | null
  savedName: string | null
}

export const emptyRename: RenameState = { error: null, savedName: null }
