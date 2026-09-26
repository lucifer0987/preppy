'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginState } from './actions'

const initial: LoginState = { error: null }

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initial)

  return (
    <form action={action} className="mt-8 space-y-5">
      <Field label="Username" name="username" type="text" autoComplete="username" autoFocus />
      <PasswordField />

      {state.error && (
        <p role="alert"
           className="flex items-start gap-2.5 rounded-control border border-bad/30 bg-bad/10 px-4 py-3
                      text-sm font-semibold text-bad-ink">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-current">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 9.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/>
          </svg>
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  )
}

const FIELD = `w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-base text-ink
               outline-none transition placeholder:text-ink-faint
               focus:border-accent focus:ring-4 focus:ring-accent/15`

function Field(props: {
  label: string; name: string; type: string; autoComplete: string; autoFocus?: boolean
}) {
  const { label, ...rest } = props
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input {...rest} required className={`mt-2 ${FIELD}`} />
    </label>
  )
}

/**
 * Shown by choice, not by default. Typing a password you cannot see, on a
 * laptop, at five to ten, is how people end up locked out by the rate limit.
 */
function PasswordField() {
  const [shown, setShown] = useState(false)
  return (
    <label className="block">
      <span className="eyebrow">Password</span>
      <div className="relative mt-2">
        <input
          name="password" type={shown ? 'text' : 'password'} autoComplete="current-password" required
          className={`${FIELD} pr-24`}
        />
        <button
          type="button" onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 px-4 text-xs font-bold uppercase tracking-widest
                     text-ink-faint transition hover:text-accent"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full py-4 text-lg transition
                 hover:bg-accent-hover active:translate-y-px disabled:opacity-60"
    >
      {pending ? 'Checking…' : 'Log in'}
    </button>
  )
}
