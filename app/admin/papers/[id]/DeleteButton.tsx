'use client'

import { useState } from 'react'
import { deleteAction } from './actions'

/**
 * Deleting a paper takes its questions and any dry runs with it and cannot be
 * undone, so it is two clicks, the second naming what will go.
 */
export function DeleteButton({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
              className="text-sm font-bold text-notanswered underline">
        Delete this paper
      </button>
    )
  }

  return (
    <form action={deleteAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm font-semibold">Delete {label} and its dry runs for good?</span>
      <button type="button" onClick={() => setConfirming(false)}
              className="rounded-xl border-2 border-line-strong px-3 py-1.5 text-sm font-bold">
        Keep it
      </button>
      <button type="submit" className="rounded-xl bg-notanswered px-3 py-1.5 text-sm font-black text-white">
        Delete
      </button>
    </form>
  )
}
