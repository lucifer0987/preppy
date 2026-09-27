'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, renameUserAction, resetPasswordAction } from './actions'
import { emptyRename, emptyUserAction } from './state'
import { Flash } from '../../../components/Page'

/** A password is shown once. There is no email on file to send it to. */
function Credential({ credential, compact = false }: {
  credential: { username: string; password: string }
  /** Inside a table cell, where there is no room for the full-width form version. */
  compact?: boolean
}) {
  return (
    <div className={`rounded-control bg-answered text-left text-white ${
      compact ? 'mt-2 w-60 px-3.5 py-3' : 'mt-4 px-5 py-4'}`}>
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-white/70">
        Copy this now &mdash; it is not shown again
      </p>
      <p className={`mt-1.5 font-mono ${compact ? 'text-sm' : 'text-lg'}`}>
        {credential.username} &middot; {credential.password}
      </p>
      <p className={`mt-1 text-white/80 ${compact ? 'text-xs' : 'text-sm'}`}>
        They must change it the next time they log in.
      </p>
    </div>
  )
}

export function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, emptyUserAction)

  return (
    <>
      <form action={action} className="card mt-4 grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field name="username" label="Username" placeholder="student6" />
        <Field name="displayName" label="Display name" placeholder="Student Six" />
        <fieldset className="sm:col-span-2">
          <legend className="eyebrow">Role</legend>
          <div className="mt-1.5 inline-flex rounded-control border border-line-strong bg-surface-sunken p-0.5">
            {([['student', 'Student', 'Sits papers and appears on the board'],
               ['admin', 'Admin', 'Uploads and schedules; never counted']] as const).map(([v, label, hint], i) => (
              <label key={v} title={hint}
                     className="relative cursor-pointer rounded-[0.6rem] px-4 py-2 text-sm font-semibold
                                 text-ink-soft transition hover:text-ink
                                 has-[:checked]:bg-accent has-[:checked]:text-on-brand
                                 has-[:checked]:shadow-low">
                <input type="radio" name="role" value={v} defaultChecked={i === 0} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-start-3 sm:row-start-1">
          <Submit label="Create" pendingLabel="Creating..." />
        </div>
      </form>
      {state.error && (
        <Flash tone="bad" className="mt-3">
          {state.error}
        </Flash>
      )}
      {state.credential && <Credential credential={state.credential} />}
    </>
  )
}

/**
 * Rename anyone, in the cell that already shows the name.
 *
 * A rename is rare and low-stakes, so it does not deserve a screen of its own
 * or a row of buttons next to every name. The name is a button; pressing it
 * puts an input in its place, and Escape or a click elsewhere puts it back.
 */
export function RenameForm({ userId, displayName }: { userId: string; displayName: string }) {
  const [state, action] = useActionState(renameUserAction, emptyRename)
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // The server has the new name once it comes back, so the field closes itself.
  useEffect(() => { if (state.savedName) setEditing(false) }, [state.savedName])
  useEffect(() => { if (editing) input.current?.select() }, [editing])

  const name = state.savedName ?? displayName

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button" onClick={() => setEditing(true)}
          title={`Rename ${name}`}
          className="group inline-flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-1 -mx-1.5
                     text-left transition hover:bg-surface-sunken"
        >
          <span className="truncate">{name}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"
               className="h-3.5 w-3.5 shrink-0 fill-ink-faint transition group-hover:fill-accent">
            <path d="M11.3 1.7a1.6 1.6 0 012.3 0l.7.7a1.6 1.6 0 010 2.3l-7.2 7.2-3.6 1.2 1.2-3.6 7.2-7.2zM2 14h12v1.5H2V14z" />
          </svg>
          <span className="sr-only">Rename</span>
        </button>
      </div>
    )
  }

  return (
    <form
      action={action}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="userId" value={userId} />
      <input
        ref={input} name="displayName" defaultValue={name} required maxLength={60}
        aria-label="Display name"
        className="field w-40 px-2.5 py-1.5 text-sm"
      />
      <RenameButtons onCancel={() => setEditing(false)} />
      {state.error && (
        <p role="alert" className="basis-full text-xs font-semibold text-bad-ink">{state.error}</p>
      )}
    </form>
  )
}

/** Inside the form, so the Save button can read its pending state. */
function RenameButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus()
  return (
    <>
      <button type="submit" disabled={pending}
              className="btn btn-primary px-3 py-1.5 text-xs">
        {pending ? 'Saving...' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={pending}
              className="btn btn-quiet px-3 py-1.5 text-xs">
        Cancel
      </button>
    </>
  )
}

/**
 * Reset a password, in two presses.
 *
 * One press used to do it, and it ends every session the account has open --
 * including a student halfway through tonight's paper. Asking twice costs the
 * admin a click and costs a misclick nothing.
 */
export function ResetPasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyUserAction)
  const [armed, setArmed] = useState(false)

  return (
    <>
      {armed ? (
        <form action={action} className="flex items-center gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <button className="btn btn-primary px-3 py-1.5 text-xs">Set a new one</button>
          <button type="button" onClick={() => setArmed(false)}
                  className="btn btn-quiet px-3 py-1.5 text-xs">Cancel</button>
        </form>
      ) : (
        <button type="button" onClick={() => setArmed(true)}
                className="btn btn-quiet px-3 py-1.5 text-xs">
          Reset password
        </button>
      )}
      {state.error && <p className="mt-1 text-xs font-semibold text-bad-ink">{state.error}</p>}
      {state.credential && state.credential.username === username && (
        <Credential credential={state.credential} compact />
      )}
    </>
  )
}

function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        name={name} required placeholder={placeholder}
        className="field mt-1.5
                   outline-none transition focus:border-play-purple"
      />
    </label>
  )
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="btn btn-primary w-full px-5 py-2.5"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
