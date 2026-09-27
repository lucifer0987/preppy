'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * FR-6.5.1: Begin requests full screen, and if the browser denies it the test
 * does not start.
 *
 * requestFullscreen needs a user gesture, so it is called here, in the click,
 * before the form is submitted. The server action's redirect is a client-side
 * navigation, so the document — and full screen with it — carries straight
 * into the engine.
 */
export function BeginButton() {
  const { pending } = useFormStatus()
  const [requesting, setRequesting] = useState(false)
  const [denied, setDenied] = useState(false)
  const busy = pending || requesting

  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget.form
    setDenied(false)
    setRequesting(true)
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    } catch {
      setRequesting(false)
      setDenied(true)
      return
    }
    form?.requestSubmit()
    setRequesting(false)
  }

  return (
    <>
      <button
        type="submit"
        onClick={onClick}
        disabled={busy}
        className="btn btn-zap w-full py-4 text-lg"
      >
        {busy ? 'Starting…' : 'Begin'}
      </button>
      {denied && (
        <p role="alert" className="mt-3 text-center text-sm font-semibold text-bad-ink">
          Your browser did not allow full screen, so the test has not started. Allow it and press
          Begin again.
        </p>
      )}
    </>
  )
}
