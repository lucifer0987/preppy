'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { finaliseNowAction, type FinaliseState } from './finalise'

const initial: FinaliseState = { error: null, summary: null }

/**
 * Runs the 00:05 finalise job now (FR-10.3). Anything still open past its
 * paper's hard stop is force-submitted and scored; attempts still inside
 * their window are left alone, so this is safe to press at any hour.
 */
export function FinaliseButton() {
  const [state, action] = useActionState(finaliseNowAction, initial)

  return (
    <div>
      <form action={action}>
        <Submit />
      </form>
      {state.error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-notanswered px-5 py-3 text-sm font-semibold text-white">
          {state.error}
        </p>
      ) : state.summary ? (
        <p role="status" className="mt-3 rounded-2xl bg-answered px-5 py-3 text-sm font-semibold text-white">
          {state.summary}
        </p>
      ) : null}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl bg-play-purple px-5 py-2.5 font-black text-white transition disabled:opacity-60"
    >
      {pending ? 'Finalising...' : 'Finalise open attempts now'}
    </button>
  )
}
