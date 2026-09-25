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
