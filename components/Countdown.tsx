'use client'

import { useEffect, useState } from 'react'

/**
 * Counts down to the next unlock.
 *
 * The target instant is computed on the server and passed in, so a wrong clock
 * on the viewer's machine shifts only this display and never anything that
 * decides a score (FR-6.4.7 keeps the real timer server-authoritative).
 *
 * Server and client necessarily render different second values, because time
 * passes between the two. `suppressHydrationWarning` accepts that instead of
 * hiding the countdown behind a placeholder; the first tick, a second later,
 * corrects any drift.
 */
export function Countdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime()
  const [remaining, setRemaining] = useState(() => target - Date.now())

  useEffect(() => {
    const tick = () => setRemaining(target - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  const clamped = Math.max(0, remaining)
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)

  return (
    <div
      className="flex gap-2"
      role="timer"
      // A timer that announced every second would make the page unusable with
      // a screen reader, so the label carries the information once instead.
      aria-live="off"
      aria-label={`Next paper unlocks in ${hours} hours ${minutes} minutes`}
    >
      <Cell value={hours} label="hrs" />
      <Cell value={minutes} label="min" />
      <Cell value={seconds} label="sec" />
    </div>
  )
}

function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[4.5rem] flex-col items-center rounded-2xl bg-white/15 px-4 py-3">
      <span className="text-3xl font-black leading-none tabular-nums" suppressHydrationWarning>
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
    </div>
  )
}
