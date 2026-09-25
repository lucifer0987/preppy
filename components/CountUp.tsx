'use client'

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './motion'

/**
 * Counts a score up from zero (PRD 6.6).
 *
 * Renders the final value immediately for anyone who asked for reduced motion,
 * and on the server, so the number is never briefly wrong in the page source.
 */
export function CountUp({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return }

    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // Ease out, so it settles rather than stopping dead.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(from + (value - from) * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else setShown(value)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, durationMs])

  return <span className="tabular-nums" suppressHydrationWarning>{shown.toFixed(2)}</span>
}
