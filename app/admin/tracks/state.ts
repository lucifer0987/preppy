/** Kept out of actions.ts: a "use server" module may only export async functions. */
export interface TrackFormState {
  error: string | null
  /** The name of the track just created, for the line that confirms it. */
  created: string | null
}

export const emptyTrackForm: TrackFormState = { error: null, created: null }
