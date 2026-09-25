/**
 * A streak is the one number that rewards turning up rather than scoring well,
 * which is why it sits next to the score rather than inside the ranking.
 */
export function StreakBadge({ days, size = 'sm' }: { days: number; size?: 'sm' | 'lg' }) {
  if (days <= 0) return null
  const big = size === 'lg'
  const tone =
    days >= 30 ? 'bg-play-violet' : days >= 7 ? 'bg-play-red' : days >= 3 ? 'bg-play-yellow' : 'bg-ink-soft'

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-bold text-white',
        tone,
        big ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-[11px]',
      ].join(' ')}
      aria-label={`${days} paper streak`}
    >
      <span aria-hidden="true">{days >= 7 ? '🔥' : '•'}</span>
      {days}
      {big && <span className="font-semibold opacity-80">in a row</span>}
    </span>
  )
}
