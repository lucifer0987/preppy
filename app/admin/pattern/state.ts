/** Kept out of actions.ts: a "use server" module may only export async functions. */
export interface PatternFormState {
  error: string | null
  saved: boolean
}

export const emptyPatternForm: PatternFormState = { error: null, saved: false }
