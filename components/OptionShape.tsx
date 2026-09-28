import type { OptionLabel } from '../lib/types'

/**
 * Kahoot's option motif (PRD section 8.2).
 *
 * Shape carries the distinction independently of colour, so the brand device
 * itself satisfies the requirement that status is never encoded by colour
 * alone. Each label keeps the same shape and colour everywhere in the product.
 *
 * Four of them, which is Kahoot's own set: triangle, diamond, circle, square.
 * A fifth was here, a star, for as long as questions carried five options.
 */
const SHAPES: Record<OptionLabel, { clip?: string; round?: boolean; bg: string; name: string }> = {
  A: { clip: 'polygon(50% 0%, 100% 100%, 0% 100%)', bg: 'var(--color-play-red)', name: 'triangle' },
  B: { clip: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', bg: 'var(--color-play-blue)', name: 'diamond' },
  C: { round: true, bg: 'var(--color-play-yellow)', name: 'circle' },
  D: { bg: 'var(--color-play-green)', name: 'square' },
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
