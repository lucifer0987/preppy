import type { Issue } from '../../../../lib/types'

/**
 * Shared action state.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions; a plain object export there is a build error.
 */
export interface UploadState {
  issues: Issue[]
  fileName: string | null
  /** Set when nothing could be read at all. */
  fatal: string | null
}

export const emptyUpload: UploadState = { issues: [], fileName: null, fatal: null }
