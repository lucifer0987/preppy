'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { finaliseNowAction, type FinaliseState } from './finalise'
import { Flash } from '../../components/Page'

const initial: FinaliseState = { error: null, summary: null }

/**
 * Runs the finalise job now (FR-10.3), without waiting for 1 PM or 1 AM.
 * Anything still open past its
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
        <Flash tone="bad" className="mt-3">
          {state.error}
        </Flash>
      ) : state.summary ? (
        <Flash tone="good" className="mt-3">
          {state.summary}
        </Flash>
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
      className="btn btn-primary px-5 py-2.5"
    >
      {pending ? 'Finalising...' : 'Finalise open attempts now'}
    </button>
  )
}
