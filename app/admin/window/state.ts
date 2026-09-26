/** Kept out of actions.ts: a "use server" module may only export async functions. */
export interface WindowFormState {
  error: string | null
  saved: boolean
}

export const emptyWindowForm: WindowFormState = { error: null, saved: false }
