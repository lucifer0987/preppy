import type { Issue } from '../../../../lib/types'

/**
 * Shared action state for the question editor.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions; a plain object export there is a build error.
 */
export interface EditState {
  issues: Issue[]
  /** Set when the edit could not be attempted at all. */
  fatal: string | null
  saved: boolean
}

export const emptyEdit: EditState = { issues: [], fatal: null, saved: false }
