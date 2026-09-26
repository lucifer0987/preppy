'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveWindowAction } from './actions'
import { emptyWindowForm } from './state'
import { formatIstTime, windowLabels, windowProblem, type WindowSettings } from '../../../lib/time'
import { Flash } from '../../../components/Page'

/**
 * Editing the nightly window.
 *
 * The preview below the boxes recomputes as you type, and uses the same
 * `windowProblem` the server and the database use, so a window that will be
 * refused says so before you submit it.
 */
export function WindowForm(
  { current, attemptMinutes }: { current: WindowSettings; attemptMinutes: number },
) {
  const [state, action] = useActionState(saveWindowAction, emptyWindowForm)
  const [draft, setDraft] = useState<WindowSettings>(current)

  const problem = windowProblem(draft, attemptMinutes)
  const labels = problem ? null : windowLabels(draft, attemptMinutes)
  const latestClose = 24 * 60 - attemptMinutes

  const set = (k: keyof WindowSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [k]: Number(e.target.value) })

  return (
    <form action={action} className="mt-4 card p-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TimeField
          label="Papers unlock at" hourName="openHour" minuteName="openMinute"
          hour={draft.openHour} minute={draft.openMinute}
          onHour={set('openHour')} onMinute={set('openMinute')}
          hint="When tonight's paper becomes available."
        />
        <TimeField
          label="Last moment to start" hourName="entryCloseHour" minuteName="entryCloseMinute"
          hour={draft.entryCloseHour} minute={draft.entryCloseMinute}
          onHour={set('entryCloseHour')} onMinute={set('entryCloseMinute')}
          hint={`Anyone starting before this still gets the full ${attemptMinutes} minutes.`}
        />
      </div>

      <div className="mt-5 rounded-control bg-surface-sunken p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">What students will see</p>
        {problem ? (
          <p className="mt-2 text-sm font-semibold text-bad-ink">{problem}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            <li><strong>{labels!.opens}</strong> &mdash; paper unlocks</li>
            <li><strong>{labels!.closes}</strong> &mdash; last entry, no new starts after this</li>
            <li><strong>{labels!.hardStop}</strong> &mdash; everyone finished; answers unlock</li>
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          Entry must close by {formatIstTime(Math.floor(latestClose / 60), latestClose % 60)} at the
          very latest, so the last person to start still finishes before midnight. An attempt running
          past midnight would sit on the wrong date for the archive and the leaderboard.
        </p>
      </div>

      {state.error && (
        <Flash tone="bad" className="mt-4">
          {state.error}
        </Flash>
      )}
      {state.saved && !state.error && (
        <Flash tone="good" className="mt-4">
          Saved. Every page shows the new times from now on.
        </Flash>
      )}

      <Submit disabled={problem !== null} />
    </form>
  )
}

function TimeField({
  label, hourName, minuteName, hour, minute, onHour, onMinute, hint,
}: {
  label: string; hourName: string; minuteName: string
  hour: number; minute: number
  onHour: (e: React.ChangeEvent<HTMLInputElement>) => void
  onMinute: (e: React.ChangeEvent<HTMLInputElement>) => void
  hint: string
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Box name={hourName} value={hour} max={23} onChange={onHour} aria-label={`${label}, hour`} />
        <span className="text-xl font-bold text-ink-soft">:</span>
        <Box name={minuteName} value={minute} max={59} onChange={onMinute} aria-label={`${label}, minute`} />
        <span className="ml-1 text-sm text-ink-soft">{formatIstTime(hour, minute)}</span>
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>
    </div>
  )
}

function Box(props: {
  name: string; value: number; max: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
} & Record<string, unknown>) {
  const { name, value, max, onChange, ...rest } = props
  return (
    <input
      {...rest}
      type="number" name={name} value={value} min={0} max={max} required onChange={onChange}
      className="field w-20 text-center text-lg font-bold tabular-nums"
    />
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending || disabled}
      className="btn btn-primary mt-5"
    >
      {pending ? 'Saving...' : 'Save these times'}
    </button>
  )
}
