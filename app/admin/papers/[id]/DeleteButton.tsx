'use client'

import { useState } from 'react'
import { deleteAction } from './actions'

/**
 * Deleting a paper takes its questions and any dry runs with it and cannot be
 * undone, so it is two clicks, the second naming what will go.
 */
export function DeleteButton({ id, label, force = false }: {
  id: string
  label: string
  /**
   * The paper has been sat. The screen that passes this has already said how
   * many attempts go with it; the flag is what lets the repository agree.
   */
  force?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
              className="btn btn-quiet px-4 py-2 text-sm">
        Delete this paper
      </button>
    )
  }

  return (
    <form action={deleteAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {force && <input type="hidden" name="force" value="yes" />}
      <span className="text-sm font-semibold">Delete {label} for good?</span>
      <button type="button" onClick={() => setConfirming(false)}
              className="btn btn-quiet px-4 py-2 text-sm">
        Keep it
      </button>
      <button type="submit" className="btn btn-danger px-4 py-2 text-sm">
        Delete
      </button>
    </form>
  )
}
