'use client'

import { useRef } from 'react'
import { setUserTrackAction } from './actions'

/**
 * Which exam a student is preparing for, changed in the cell that shows it.
 *
 * A select that submits on change, because moving somebody between exams is
 * one decision and a Save button beside it would be a second one. Their
 * history does not move with them: every attempt stays on the paper it was
 * sat, which is the only place it means anything.
 */
export function TrackCell({ userId, trackId, tracks }: {
  userId: string
  trackId: string | null
  tracks: { id: string; name: string }[]
}) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form action={setUserTrackAction} ref={form}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="trackId" defaultValue={trackId ?? ''}
        onChange={() => form.current?.requestSubmit()}
        aria-label="Which exam they are preparing for"
        className="field select-field w-auto py-1 text-sm"
      >
        {!trackId && <option value="" disabled>Not set</option>}
        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </form>
  )
}
