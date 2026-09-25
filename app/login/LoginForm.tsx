'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginState } from './actions'

const initial: LoginState = { error: null }

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initial)

  return (
    <form action={action} className="mt-8 space-y-4">
      <Field label="Username" name="username" type="text" autoComplete="username" autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />

      {state.error && (
        <p role="alert" className="rounded-xl bg-notanswered/10 px-4 py-3 text-sm font-semibold text-notanswered">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  )
}

function Field(props: {
  label: string; name: string; type: string; autoComplete: string; autoFocus?: boolean
}) {
  const { label, ...rest } = props
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">{label}</span>
      <input
        {...rest}
        required
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
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-play-purple px-6 py-4 text-lg font-black text-white
                 transition hover:bg-play-purple-deep disabled:opacity-60"
    >
      {pending ? 'Checking...' : 'Log in'}
    </button>
  )
}
