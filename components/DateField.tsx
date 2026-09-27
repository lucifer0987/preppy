'use client'

import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'

/**
 * A night, picked from a calendar the app draws.
 *
 * The native date input handed its popup to the browser: the panel, the
 * selected day and the arrows were the platform's, so on the dark theme it
 * arrived as a light card with the system blue in it, and none of it moved
 * when the theme did. react-day-picker renders the grid; everything visible
 * here is this app's own tokens.
 *
 * The value still leaves as a hidden YYYY-MM-DD field, so the server action is
 * untouched.
 */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}
/**
 * Spelled out by hand rather than by Intl.
 *
 * Intl.DateTimeFormat('en-IN') disagrees with itself across ICU versions:
 * Node rendered "Fri 9 October, 2026" and the browser "Fri, 9 October 2026",
 * which is a hydration mismatch on every schedule form. Nothing here depends
 * on the reader's locale -- the whole product is one cohort in one timezone --
 * so the format is simply written down.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const longDate = (d: Date) =>
  `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

export function DateField({ name, defaultValue, min, label }: {
  name: string
  defaultValue: string
  /** Earliest selectable day, as YYYY-MM-DD. */
  min?: string
  label: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = fromIso(value)

  return (
    <div ref={wrap} className="relative">
      <span className="eyebrow">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="field mt-1.5 flex w-full max-w-xs items-center justify-between gap-3 text-left"
      >
        <span className="font-semibold">{longDate(selected)}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-ink-faint">
          <path d="M4 3h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm0 4v9h12V7zM6 1.5h1.5V4H6zm6.5 0H14V4h-1.5z" />
        </svg>
      </button>
      <input type="hidden" name={name} value={value} />

      {open && (
        <div role="dialog" aria-label={label}
             className="absolute left-0 top-full z-30 mt-2 rounded-card border border-line
                        bg-surface p-3 shadow-high">
          <DayPicker
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => { if (d) { setValue(iso(d)); setOpen(false) } }}
            disabled={min ? { before: fromIso(min) } : undefined}
            showOutsideDays
          />
        </div>
      )}
    </div>
  )
}
