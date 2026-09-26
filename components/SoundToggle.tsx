'use client'

import { useState, useTransition } from 'react'
import { play } from './sound'
import { setSoundAction } from '../app/sound'

/**
 * The sound switch. The setting belongs to the person (PRD 8.3), so it comes
 * from the server and is saved there; if saving fails the switch flips back.
 */
export function SoundToggle({ initial, compact = false }: { initial: boolean; compact?: boolean }) {
  const [on, setOn] = useState(initial)
  const [, startTransition] = useTransition()

  const toggle = () => {
    const next = !on
    setOn(next)
    // Confirm the change audibly, which is also the gesture that unlocks audio.
    if (next) void play('click')
    startTransition(async () => {
      try { await setSoundAction(next) } catch { setOn(!next) }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-bold transition',
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        on ? 'bg-play-purple text-white' : 'bg-surface-sunken text-ink-soft hover:bg-line',
      ].join(' ')}
    >
      <span aria-hidden="true">{on ? '♪' : '∅'}</span>
      Sound {on ? 'on' : 'off'}
    </button>
  )
}
