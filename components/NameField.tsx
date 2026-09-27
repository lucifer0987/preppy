'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Flash } from './Page'

/**
 * Your own name, edited in place.
 *
 * The same control the console uses on other people, because it is the same
 * job: the name is a button, pressing it puts a field in its place, and
 * Escape or Cancel puts it back. Nothing here takes an id -- the action reads
 * the signed-in user from the session, so this form cannot rename anybody
 * else however it is submitted.
 */
export function NameField({ displayName, action }: {
  displayName: string
  action: (prev: { error: string | null; savedName: string | null }, formData: FormData)
    => Promise<{ error: string | null; savedName: string | null }>
}) {
  const [state, run] = useActionState(action, { error: null, savedName: null })
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (state.savedName) setEditing(false) }, [state.savedName])
  useEffect(() => { if (editing) input.current?.select() }, [editing])

  const name = state.savedName ?? displayName

  return (
    <div>
      <p className="eyebrow">Your name</p>
      {editing ? (
        <form
          action={run}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
          className="mt-1.5 flex flex-wrap items-center gap-2"
        >
          <input
            ref={input} name="displayName" defaultValue={name} required maxLength={60}
            aria-label="Your name"
            className="field w-full max-w-xs"
          />
          <Buttons onCancel={() => setEditing(false)} />
        </form>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <p className="text-lg font-bold">{name}</p>
          <button type="button" onClick={() => setEditing(true)}
                  className="btn btn-quiet px-4 py-2 text-sm">
            Change it
          </button>
        </div>
      )}
      {state.error && <Flash tone="bad" className="mt-3 text-sm">{state.error}</Flash>}
      {state.savedName && !editing && (
        <p className="mt-2 text-sm text-good-ink">Saved. The board and the archive show it now.</p>
      )}
      <p className="measure mt-2 text-sm text-ink-soft">
        This is what the leaderboard and the archive call you. Your username is your login and
        cannot be changed.
      </p>
    </div>
  )
}

function Buttons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus()
  return (
    <>
      <button type="submit" disabled={pending} className="btn btn-primary px-4 py-2 text-sm">
        {pending ? 'Saving...' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={pending}
              className="btn btn-quiet px-4 py-2 text-sm">
        Cancel
      </button>
    </>
  )
}
