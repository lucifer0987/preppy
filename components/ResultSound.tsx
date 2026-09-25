'use client'

import { useEffect } from 'react'
import { play } from './sound'
import { claimFirstView } from './motion'

/**
 * Plays once when the result page opens, if the viewer has turned sound on
 * (the page passes no tune otherwise).
 * Separate from Celebration so the two can be reasoned about independently:
 * one is visual, one is audible, and either can be off.
 *
 * With `onceKey`, it plays only on the first view of that key in this browser.
 */
export function ResultSound({ tune, onceKey }: { tune: 'result' | 'personal-best' | null; onceKey?: string }) {
  useEffect(() => {
    if (!tune) return
    const id = setTimeout(() => {
      if (onceKey && !claimFirstView(`${onceKey}.sound`)) return
      void play(tune)
    }, 250)
    return () => clearTimeout(id)
  }, [tune, onceKey])
  return null
}
