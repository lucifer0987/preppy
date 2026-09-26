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
        <p role="alert" className="rounded-xl bg-notanswered/10 px-4 py-3 text-sm font-semibold text-bad-ink">
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
      <span className="eyebrow">{label}</span>
      <input
        type="password" name={name} autoComplete={autoComplete} autoFocus={autoFocus} required
        className="field mt-1.5 text-lg"
      />
    </label>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="btn btn-primary w-full px-6 py-4 text-lg"
    >
      {pending ? 'Changing...' : 'Change password'}
    </button>
  )
}
