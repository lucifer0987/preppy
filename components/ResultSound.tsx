'use client'

import { useEffect } from 'react'
import { play } from './sound'

/**
 * Plays once when the result page opens, if the viewer has turned sound on.
 * Separate from Celebration so the two can be reasoned about independently:
 * one is visual, one is audible, and either can be off.
 */
export function ResultSound({ tune }: { tune: 'result' | 'personal-best' | null }) {
  useEffect(() => {
    if (!tune) return
    const id = setTimeout(() => void play(tune), 250)
    return () => clearTimeout(id)
  }, [tune])
  return null
}
