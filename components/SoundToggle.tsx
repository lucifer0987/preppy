'use client'

import { useEffect, useState } from 'react'
import { play, setSoundEnabled, soundEnabled } from './sound'

/**
 * Reads localStorage after mount, so the server and the first client render
 * agree and there is no hydration mismatch.
 */
export function SoundToggle({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null)

  useEffect(() => { setOn(soundEnabled()) }, [])
  if (on === null) return null

  const toggle = () => {
    const next = !on
    setOn(next)
    setSoundEnabled(next)
    // Confirm the change audibly, which is also the gesture that unlocks audio.
    if (next) void play('click')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-bold transition',
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        on ? 'bg-play-purple text-white' : 'bg-black/5 text-ink-soft hover:bg-black/10',
      ].join(' ')}
    >
      <span aria-hidden="true">{on ? '♪' : '♪'}</span>
      Sound {on ? 'on' : 'off'}
    </button>
  )
}
