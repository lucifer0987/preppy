'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { fullscreenSupported } from '../../../lib/fullscreen'

/**
 * FR-6.5.1: Begin asks for full screen, and a browser that *refuses* it stops
 * the test from starting. A browser that cannot offer it at all does not.
 *
 * That distinction is the whole of this. requestFullscreen needs a user
 * gesture, so it is called here, in the click, before the form is submitted;
 * the server action's redirect is a client-side navigation, so the document --
 * and full screen with it -- carries straight into the engine.
 *
 * But iPhone Safari has no Element.requestFullscreen at all: only video can go
 * full screen there. Calling it threw, the catch treated that as a refusal,
 * and the form was never submitted -- so on an iPhone Begin could not start a
 * paper, ever, and no attempt row was written. The student was told their
 * browser had denied a permission it was never asked for.
 *
 * So: where the API exists, a refusal is still a refusal and still stops the
 * start. Where it does not exist, the paper begins without it. The engine
 * already copes -- it only counts exits from a full screen it actually entered.
 */
export function BeginButton({ label = 'Begin' }: {
  /** "Begin" for the real thing, "Start practicing" for a practice run. */
  label?: string
}) {
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
    if (fullscreenSupported(document)) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
      } catch {
        setRequesting(false)
        setDenied(true)
        return
      }
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
        {busy ? 'Starting…' : label}
      </button>
      {denied && (
        <p role="alert" className="mt-3 text-center text-sm font-semibold text-bad-ink">
          Your browser did not allow full screen, so nothing has started. Allow it and press{' '}
          {label} again.
        </p>
      )}
    </>
  )
}
