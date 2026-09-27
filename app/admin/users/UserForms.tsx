'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, resetPasswordAction } from './actions'
import { emptyUserAction } from './state'
import { Flash } from '../../../components/Page'

/** A password is shown once. There is no email on file to send it to. */
function Credential({ credential }: { credential: { username: string; password: string } }) {
  return (
    <div className="mt-4 rounded-control bg-answered px-5 py-4 text-white">
      <p className="text-xs font-bold uppercase tracking-widest text-white/70">
        Copy this now — it is not shown again
      </p>
      <p className="mt-2 font-mono text-lg">
        {credential.username} &middot; {credential.password}
      </p>
      <p className="mt-1 text-sm text-white/80">
        They must change it the first time they log in.
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
                     className="relative cursor-pointer rounded-[0.6rem] px-3.5 py-1.5 text-sm font-semibold
                                text-ink-soft transition has-[:checked]:bg-surface has-[:checked]:text-ink
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

export function ResetPasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyUserAction)

  return (
    <>
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <button className="text-xs font-bold text-accent underline">Reset password</button>
      </form>
      {state.error && <p className="mt-1 text-xs font-semibold text-bad-ink">{state.error}</p>}
      {state.credential && state.credential.username === username && (
        <Credential credential={state.credential} />
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
