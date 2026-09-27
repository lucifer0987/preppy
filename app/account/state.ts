/**
 * Kept out of actions.ts because a "use server" module may only export async
 * functions.
 */
export interface ChangePasswordState {
  error: string | null
}

export const emptyChangePassword: ChangePasswordState = { error: null }

/** Renaming yourself: the name that was actually stored, trimmed. */
export interface RenameSelfState {
  error: string | null
  savedName: string | null
}

export const emptyRenameSelf: RenameSelfState = { error: null, savedName: null }
