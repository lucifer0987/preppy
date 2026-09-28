'use client'

import { useActionState, useCallback, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveWindowAction } from './actions'
import { emptyWindowForm } from './state'
import { formatIstTime, windowLabels, windowProblem, type WindowSettings } from '../../../lib/time'
import { Flash } from '../../../components/Page'
import { TimeField } from '../../../components/TimeField'

/**
 * Editing the nightly window.
 *
 * The two times are picked with the same control the schedule form uses, so a
 * time is read and set the same way everywhere in the console. It used to be
 * two bare number boxes on a 24-hour clock -- "22 : 0" -- which is the one
 * format nobody on this app ever reads anywhere else.
 *
 * The preview below recomputes as you pick, and uses the same `windowProblem`
 * the server and the database use, so a window that will be refused says so
 * before you submit it.
 */
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
const parts = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return { h: h ?? 0, m: m ?? 0 }
}

export function WindowForm(
  { current, attemptMinutes }: { current: WindowSettings; attemptMinutes: number },
) {
  const [state, action] = useActionState(saveWindowAction, emptyWindowForm)
  const [openAt, setOpenAt] = useState(hhmm(current.openHour, current.openMinute))
  const [closeAt, setCloseAt] = useState(hhmm(current.entryCloseHour, current.entryCloseMinute))

  // Hoisted: TimeField only calls back when the value changes, and a fresh
  // function each render would make that an every-render effect.
  const onOpen = useCallback((v: string) => setOpenAt(v), [])
  const onClose = useCallback((v: string) => setCloseAt(v), [])

  const open = parts(openAt)
  const close = parts(closeAt)
  const draft: WindowSettings = {
    openHour: open.h, openMinute: open.m,
    entryCloseHour: close.h, entryCloseMinute: close.m,
  }

  const problem = windowProblem(draft, attemptMinutes)
  const labels = problem ? null : windowLabels(draft, attemptMinutes)

  return (
    <form action={action} className="card mt-4 p-5 sm:p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <TimeField
          name="openAt" label="Papers unlock at" defaultValue={openAt}
          onChange={onOpen}
          hint="When a paper scheduled with these times becomes available."
        />
        <TimeField
          name="entryCloseAt" label="Last moment to start" defaultValue={closeAt}
          onChange={onClose}
          hint={`Anyone starting before this still gets the full ${attemptMinutes} minutes.`}
        />
      </div>

      <div className="mt-6 rounded-control bg-surface-sunken p-4 sm:p-5">
        <p className="eyebrow">What students will see</p>
        {problem ? (
          <p className="mt-2.5 text-sm font-semibold text-bad-ink">{problem}</p>
        ) : (
          <ul className="mt-2.5 space-y-1.5 text-sm">
            <li><strong className="numeral">{labels!.opens}</strong> &middot; the paper unlocks</li>
            <li><strong className="numeral">{labels!.closes}</strong> &middot; last entry, nobody new starts after this</li>
            <li><strong className="numeral">{labels!.hardStop}</strong> &middot; everyone is finished, answers unlock</li>
          </ul>
        )}
        <p className="mt-3.5 text-xs text-ink-soft">
          Entry may close as late as you like. A paper that runs past midnight finishes on the
          following morning and still belongs to the day it opened, which is the date the archive,
          the leaderboard and the streak all count it under.
        </p>
      </div>

      {state.error && <Flash tone="bad" className="mt-4">{state.error}</Flash>}
      {state.saved && !state.error && (
        <Flash tone="good" className="mt-4">Saved. Every page shows the new times from now on.</Flash>
      )}

      <Submit disabled={problem !== null} />
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled} className="btn btn-primary mt-6">
      {pending ? 'Saving...' : 'Save these times'}
    </button>
  )
}
