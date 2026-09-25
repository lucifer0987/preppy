'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The section countdown.
 *
 * Display only. The server issues `initialSec` and owns the real clock
 * (FR-6.4.7); this just ticks it down and calls `onExpire` when it reaches
 * zero, at which point the server is asked what is actually true. It also
 * re-syncs whenever the tab becomes visible again, so a throttled background
 * timer cannot drift into showing time that does not exist.
 */
export function SectionTimer({
  initialSec, onExpire, onResync,
}: {
  initialSec: number
  onExpire: () => void
  onResync: () => void
}) {
  const [remaining, setRemaining] = useState(initialSec)
  const fired = useRef(false)

  useEffect(() => { setRemaining(initialSec); fired.current = false }, [initialSec])

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1
        if (next <= 0 && !fired.current) { fired.current = true; onExpire() }
        return Math.max(0, next)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [onExpire])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') onResync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onResync])

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  const urgent = remaining <= 60

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={`${mm} minutes ${ss} seconds left in this section`}
      className={[
        'rounded-full px-4 py-1.5 font-mono text-lg font-bold tabular-nums transition-colors',
        urgent ? 'bg-notanswered text-white' : 'bg-white text-play-purple',
      ].join(' ')}
    >
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </span>
  )
}
