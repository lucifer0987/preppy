/**
 * Kept out of actions.ts because a "use server" module may only export async
 * functions.
 */
export interface ChangePasswordState {
  error: string | null
}

export const emptyChangePassword: ChangePasswordState = { error: null }
