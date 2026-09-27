'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * Ending a paper early, in two presses.
 *
 * The second press names what it is about to do to the people in the room,
 * because this is the one control here that reaches into an exam already
 * running: a student mid-question has their paper taken and scored as it
 * stands. One button-press away is not far enough for that.
 */
export function EndNowButton({ id, running, action }: {
  id: string
  running: number
  action: (formData: FormData) => Promise<void>
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="btn btn-quiet px-5 py-2.5">
        End it now
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="basis-full text-sm font-semibold">
        {running === 0
          ? 'End it for everyone? Nobody is sitting it, so this only opens the answers and the board.'
          : `End it for everyone? ${running} ${running === 1 ? 'student is' : 'students are'} in it right now and ${running === 1 ? 'their paper' : 'their papers'} will be submitted and scored unfinished.`}
      </p>
      <Confirm />
      <button type="button" onClick={() => setArmed(false)} className="btn btn-quiet px-5 py-2.5">
        Leave it running
      </button>
    </form>
  )
}

function Confirm() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-danger px-5 py-2.5">
      {pending ? 'Ending...' : 'Yes, end it now'}
    </button>
  )
}
