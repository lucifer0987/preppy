/**
 * A streak is the one number that rewards turning up rather than scoring well,
 * which is why it sits next to the score rather than inside the ranking.
 *
 * The tones climb rather than just differing: quiet, then gold, then the energy
 * colour, which is what --zap exists for. The old scale ran through
 * `bg-play-yellow`, and white on that option yellow is 1.64:1 -- one of the
 * four answer fills borrowed as a label, where it was never meant to carry
 * words. Every fill here clears AA with white on it.
 */
export function StreakBadge({ days, size = 'sm' }: { days: number; size?: 'sm' | 'lg' }) {
  if (days <= 0) return null
  const big = size === 'lg'

  const tone =
    days >= 30 ? 'bg-zap-solid text-white ring-2 ring-gold ring-offset-0'
    : days >= 7 ? 'bg-zap-solid text-white'
    : days >= 3 ? 'bg-gold-700 text-white'
    : 'bg-surface-sunken text-ink-soft ring-1 ring-line-strong'

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill font-display font-bold',
        tone,
        big ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-[11px]',
      ].join(' ')}
      aria-label={`${days} paper streak`}
    >
      <span aria-hidden="true">{days >= 7 ? '🔥' : '•'}</span>
      <span className="numeral">{days}</span>
      {big && <span className="font-semibold opacity-80">in a row</span>}
    </span>
  )
}
