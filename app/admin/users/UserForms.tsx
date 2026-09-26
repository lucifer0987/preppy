'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createUserAction, resetPasswordAction } from './actions'
import { emptyUserAction } from './state'

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
      <form action={action} className="mt-4 grid gap-3 rounded-card bg-surface p-5 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Field name="username" label="Username" placeholder="student6" />
        <Field name="displayName" label="Display name" placeholder="Student Six" />
        <label className="block">
          <span className="eyebrow">Role</span>
          <select name="role" defaultValue="student"
                  className="field mt-1.5">
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="flex items-end">
          <Submit label="Create" pendingLabel="Creating..." />
        </div>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 rounded-control bg-notanswered px-5 py-3 font-semibold text-white">
          {state.error}
        </p>
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
      {state.error && <p className="mt-1 text-xs font-semibold text-bad">{state.error}</p>}
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
      className="w-full rounded-xl bg-play-purple px-5 py-2.5 font-black text-white
                 transition hover:bg-play-purple-deep disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
