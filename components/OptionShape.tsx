import type { OptionLabel } from '../lib/types'

/**
 * Kahoot's option motif (PRD section 8.2).
 *
 * Shape carries the distinction independently of colour, so the brand device
 * itself satisfies the requirement that status is never encoded by colour
 * alone. Each label keeps the same shape and colour everywhere in the product.
 */
const SHAPES: Record<OptionLabel, { clip?: string; round?: boolean; bg: string; name: string }> = {
  A: { clip: 'polygon(50% 0%, 100% 100%, 0% 100%)', bg: 'var(--color-play-red)', name: 'triangle' },
  B: { clip: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', bg: 'var(--color-play-blue)', name: 'diamond' },
  C: { round: true, bg: 'var(--color-play-yellow)', name: 'circle' },
  D: { bg: 'var(--color-play-green)', name: 'square' },
  E: {
    clip: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
    bg: 'var(--color-play-violet)', name: 'star',
  },
}

export function OptionShape({ label, size = 18 }: { label: OptionLabel; size?: number }) {
  const shape = SHAPES[label]
  return (
    <span
      aria-hidden="true"
      className={shape.round ? 'shrink-0 rounded-full' : 'shrink-0 rounded-[2px]'}
      style={{
        width: size,
        height: size,
        background: shape.bg,
        ...(shape.clip ? { clipPath: shape.clip, borderRadius: 0 } : {}),
      }}
    />
  )
}

export const shapeName = (label: OptionLabel) => SHAPES[label].name
