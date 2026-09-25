'use client'

import { useEffect, useState } from 'react'

/**
 * Counts down to the next unlock. The target is computed on the server and
 * passed in as an ISO instant, so a wrong clock on the viewer's machine
 * shifts only this display, never anything that decides a score.
 */
export function Countdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime()
  const [remaining, setRemaining] = useState(() => target - Date.now())

  useEffect(() => {
    const id = setInterval(() => setRemaining(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  const clamped = Math.max(0, remaining)
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)

  return (
    <div className="flex gap-2" role="timer" aria-live="off"
         aria-label={`Next paper unlocks in ${hours} hours ${minutes} minutes`}>
      <Cell value={hours} label="hrs" />
      <Cell value={minutes} label="min" />
      <Cell value={seconds} label="sec" />
    </div>
  )
}

function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white/15 px-4 py-3 min-w-[4.5rem]">
      <span className="text-3xl font-black tabular-nums leading-none">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
    </div>
  )
}
