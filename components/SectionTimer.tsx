'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The section countdown.
 *
 * Display only. The server owns the real clock (FR-6.4.7) and issues a
 * deadline plus its own "now"; this counts down to the deadline, corrected for
 * however far the browser's clock is from the server's, and calls `onExpire`
 * when it reaches zero, at which point the server is asked what is actually
 * true. Counting to an instant rather than decrementing a number means a
 * throttled background tab cannot drift, and any new reading from the server
 * — a save, a resync, a new section — simply replaces the old one.
 *
 * It also asks for a resync whenever the tab becomes visible again.
 */
export function SectionTimer({
  deadlineMs, serverNowMs, onExpire, onResync,
}: {
  deadlineMs: number
  serverNowMs: number
  onExpire: () => void
  onResync: () => void
}) {
  // First render uses the server's own difference, so SSR and hydration agree.
  const [remaining, setRemaining] = useState(() => secondsLeft(deadlineMs, serverNowMs))
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  // Every new reading restarts the countdown and re-arms expiry, even when the
  // allowance is identical to the last section's.
  useEffect(() => {
    const skew = serverNowMs - Date.now()
    let fired = false
    const tick = () => {
      const left = secondsLeft(deadlineMs, Date.now() + skew)
      setRemaining(left)
      if (left <= 0 && !fired) { fired = true; onExpireRef.current() }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [deadlineMs, serverNowMs])

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

function secondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
}
