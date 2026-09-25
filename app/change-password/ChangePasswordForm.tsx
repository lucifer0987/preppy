'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { changePasswordAction } from './actions'
import { emptyChangePassword } from './state'

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, emptyChangePassword)

  return (
    <form action={action} className="mt-8 space-y-4">
      <Field label="Current password" name="current" autoComplete="current-password" autoFocus />
      <Field label="New password" name="next" autoComplete="new-password" />
      <Field label="New password again" name="confirm" autoComplete="new-password" />

      {state.error && (
        <p role="alert" className="rounded-xl bg-notanswered/10 px-4 py-3 text-sm font-semibold text-notanswered">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  )
}

function Field({
  label, name, autoComplete, autoFocus,
}: { label: string; name: string; autoComplete: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">{label}</span>
      <input
        type="password" name={name} autoComplete={autoComplete} autoFocus={autoFocus} required
        className="mt-1.5 w-full rounded-xl border-2 border-black/10 bg-white px-4 py-3 text-lg
                   outline-none transition focus:border-play-purple"
      />
    </label>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="w-full rounded-2xl bg-play-purple px-6 py-4 text-lg font-black text-white
                 transition hover:bg-play-purple-deep disabled:opacity-60"
    >
      {pending ? 'Changing...' : 'Change password'}
    </button>
  )
}
