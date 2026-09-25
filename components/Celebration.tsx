'use client'

import { useEffect } from 'react'
import { KAHOOT_COLORS, prefersReducedMotion } from './motion'

export type CelebrationLevel = 'none' | 'good' | 'personal-best' | 'podium'

/**
 * Confetti on the result screen (PRD 6.6).
 *
 * Fires once, sized to the occasion, and not at all for someone who asked for
 * reduced motion. It is purely decorative: the page reads identically without
 * it, and nothing here can fail in a way that hides a score.
 */
export function Celebration({ level }: { level: CelebrationLevel }) {
  useEffect(() => {
    if (level === 'none' || prefersReducedMotion()) return

    let cancelled = false
    void (async () => {
      const confetti = (await import('canvas-confetti')).default
      if (cancelled) return

      const burst = (particleCount: number, spread: number, origin: { x: number; y: number }) =>
        confetti({ particleCount, spread, origin, colors: KAHOOT_COLORS, disableForReducedMotion: true })

      burst(level === 'good' ? 60 : 110, 70, { x: 0.5, y: 0.35 })

      if (level !== 'good') {
        setTimeout(() => !cancelled && burst(60, 100, { x: 0.15, y: 0.4 }), 220)
        setTimeout(() => !cancelled && burst(60, 100, { x: 0.85, y: 0.4 }), 360)
      }
    })()

    return () => { cancelled = true }
  }, [level])

  return null
}
