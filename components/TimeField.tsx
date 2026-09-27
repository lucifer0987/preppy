'use client'

import { useId, useState } from 'react'

/**
 * A time of day, chosen rather than typed into.
 *
 * The native time input hands the whole thing to the browser: its popup is
 * drawn by the platform, ignores the app's palette, and on the dark theme
 * arrived as a light panel with the system accent in it. This is three plain
 * selects, which the app can style, plus a hidden field carrying the value the
 * form already expected -- so nothing server-side changes.
 *
 * Minutes step by five because an exam window is never set to the minute, and
 * a stored value that is not on that grid is added so it cannot be silently
 * rounded away.
 */
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)

function parse(value: string): { h: number; m: number; pm: boolean } {
  const [hh, mm] = value.split(':').map((n) => Number(n))
  const h24 = Number.isFinite(hh) ? hh! : 22
  const m = Number.isFinite(mm) ? mm! : 0
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, m, pm: h24 >= 12 }
}

function to24(h: number, pm: boolean): number {
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

export function TimeField({ name, defaultValue, label, hint, max }: {
  name: string
  defaultValue: string
  label: string
  hint?: string
  /** Latest allowed time as HH:MM, matching the old input's max. */
  max?: string
}) {
  const start = parse(defaultValue)
  const [h, setH] = useState(start.h)
  const [m, setM] = useState(start.m)
  const [pm, setPm] = useState(start.pm)
  const id = useId()

  const minutes = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), start.m])]
    .sort((a, b) => a - b)

  const h24 = to24(h, pm)
  const value = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const tooLate = max !== undefined && value > max

  const select = 'field w-auto min-w-0 cursor-pointer py-2 pr-7 font-display font-bold'

  return (
    <div>
      <span className="eyebrow" id={`${id}-label`}>{label}</span>
      <div className="mt-1.5 inline-flex items-center gap-1.5" role="group" aria-labelledby={`${id}-label`}>
        <select aria-label="Hour" className={select} value={h}
                onChange={(e) => setH(Number(e.target.value))}>
          {HOURS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span aria-hidden="true" className="font-display text-lg font-black text-ink-faint">:</span>
        <select aria-label="Minute" className={select} value={m}
                onChange={(e) => setM(Number(e.target.value))}>
          {minutes.map((n) => (
            <option key={n} value={n}>{String(n).padStart(2, '0')}</option>
          ))}
        </select>
        <select aria-label="AM or PM" className={select} value={pm ? 'pm' : 'am'}
                onChange={(e) => setPm(e.target.value === 'pm')}>
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      </div>
      <input type="hidden" name={name} value={value} />
      {tooLate ? (
        <p className="mt-1.5 text-xs font-semibold text-bad-ink">
          Later than {parse(max!).h}:{String(parse(max!).m).padStart(2, '0')}
          {parse(max!).pm ? ' PM' : ' AM'}, which is the latest a paper can still finish
          before midnight.
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}
