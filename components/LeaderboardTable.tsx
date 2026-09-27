import type { LeaderboardRow } from '../lib/leaderboard'
import { StreakBadge } from './StreakBadge'

/**
 * The only surface that shows one student anything about another (FR-5.3),
 * and it shows exactly these columns.
 *
 * Read far more often than anything else here, so it is built to be scanned:
 * the reader's own row is pinned visually wherever it falls, rank and score sit
 * in mono so the columns line up, and the secondary figures step back in weight
 * rather than in size. Movement is an arrow *and* a number, never colour alone.
 *
 * Total, Avg, Accuracy and Best are in that order on purpose: it is the order
 * they break a tie in (FR-6.7.2), so reading left to right is reading the
 * ranking rule.
 */
export function LeaderboardTable({
  rows, meUserId, compact = false,
}: {
  rows: LeaderboardRow[]
  meUserId: string
  /** The dashboard's inline panel (PRD 6.3): the table only, no podium. */
  compact?: boolean
}) {
  if (!rows.length) {
    // Inside the dashboard panel this is one line among other panels, so a
    // dashed box here put a box inside a box while the panel beside it said
    // the same kind of thing in a plain sentence.
    return compact ? (
      <p className="text-sm text-ink-soft">
        The board fills in as people hand papers in. Sit one and you are on it.
      </p>
    ) : (
      <p className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-8
                    text-center text-ink-soft">
        The board fills in as people hand papers in. Sit one and you are on it.
      </p>
    )
  }

  const podium = rows.slice(0, 3)

  return (
    <>
      {!compact && podium.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {podium.map((row, i) => (
            <Podium key={row.userId} row={row} delay={i * 110} me={row.userId === meUserId} />
          ))}
        </ol>
      )}

      <div className={`overflow-hidden rounded-card border border-line bg-surface ${compact ? '' : 'mt-4'}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left">
                <Th className="w-12 pl-5">#</Th>
                <Th className="w-10"><span className="sr-only">Movement</span></Th>
                <Th>Student</Th>
                <Th align="right">Total</Th>
                <Th align="right">Papers</Th>
                <Th align="right">Avg</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Best</Th>
                <Th align="right" className="pr-5">Streak</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const me = row.userId === meUserId
                return (
                  <tr
                    key={row.userId}
                    className={[
                      'border-b border-line last:border-0 transition-colors',
                      me ? 'bg-accent-soft' : 'hover:bg-surface-sunken',
                    ].join(' ')}
                  >
                    <td className="relative py-3 pl-5 pr-2">
                      {me && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />}
                      <span className={`numeral font-bold ${row.rank <= 3 ? 'text-gold' : 'text-ink'}`}>
                        {row.rank}
                      </span>
                    </td>
                    <td className="py-3 pr-2"><Movement value={row.movement} /></td>
                    <td className="py-3 pr-3">
                      <span className={me ? 'font-bold text-ink' : 'font-medium text-ink'}>
                        {row.displayName}
                      </span>
                      {me && (
                        <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[0.5625rem]
                                         font-bold uppercase tracking-widest text-white align-middle">
                          you
                        </span>
                      )}
                    </td>
                    <Td strong>{row.totalPoints.toFixed(2)}</Td>
                    <Td>{row.testsTaken}</Td>
                    <Td>{row.avgScore.toFixed(1)}</Td>
                    <Td>{row.accuracyPct === null ? '—' : `${row.accuracyPct.toFixed(0)}%`}</Td>
                    <Td>{row.bestScore.toFixed(2)}</Td>
                    <td className="py-3 pl-2 pr-5 text-right">
                      {row.currentStreak > 0
                        ? <StreakBadge days={row.currentStreak} />
                        : <span className="text-ink-faint">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* The columns are in the order they decide the rank, which is worth
          saying once rather than leaving to be guessed from the numbers --
          but not inside the dashboard's panel, where it is longer than
          everything above it. */}
      {!compact && (
        <p className="mt-3 text-xs text-ink-faint">
          Ranked on total, then average, then accuracy, then the best single paper. Every figure
          here is measured over the window above; a streak counts days, over every paper that has
          closed.
        </p>
      )}
    </>
  )
}

function Th({ children, align = 'left', className = '' }: {
  children: React.ReactNode; align?: 'left' | 'right'; className?: string
}) {
  return (
    <th scope="col"
        className={`px-2 py-2.5 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-faint
                    ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`numeral px-2 py-3 text-right ${strong ? 'font-bold text-ink' : 'text-ink-soft'}`}>
      {children}
    </td>
  )
}

/** First, second and third, with first raised a step on wide screens. */
function Podium({ row, delay, me }: { row: LeaderboardRow; delay: number; me: boolean }) {
  const first = row.rank === 1
  const order = row.rank === 1 ? 'sm:order-2' : row.rank === 2 ? 'sm:order-1' : 'sm:order-3'
  const place = row.rank === 1 ? '1st' : row.rank === 2 ? '2nd' : '3rd'

  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className={[
        'relative overflow-hidden rounded-card p-5 text-center',
        'motion-safe:animate-[rise_420ms_cubic-bezier(.2,.8,.2,1)_both]',
        order,
        first
          ? 'bg-surface-invert text-white shadow-high sm:pb-8 sm:pt-7'
          : 'card',
        me && !first ? 'ring-2 ring-accent' : '',
      ].join(' ')}
    >
      {first && (
        <>
          {/* Two lights rather than one: gold for the rank, zap for the fact
              that somebody is winning. The card is the loudest thing on the
              page and it was reading as merely dark. */}
          <div aria-hidden="true"
               className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-gold-400/30 blur-2xl" />
          <div aria-hidden="true"
               className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-zap-500/25 blur-2xl" />
        </>
      )}
      <p className={`relative font-display text-xs font-black uppercase tracking-[0.18em]
                     ${first ? 'text-gold-300' : 'text-ink-faint'}`}>
        {first && <span aria-hidden="true" className="mr-1.5">&#9733;</span>}
        {place}
      </p>
      <p className={`relative mt-2 truncate text-lg font-bold ${first ? 'text-white' : 'text-ink'}`}>
        {row.displayName}
      </p>
      <p className={`numeral relative mt-1 text-3xl font-black ${first ? 'text-white' : 'text-accent'}`}>
        {row.totalPoints.toFixed(2)}
      </p>
      {row.currentStreak > 0 && (
        <p className="relative mt-3 flex justify-center"><StreakBadge days={row.currentStreak} /></p>
      )}
    </li>
  )
}

function Movement({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-faint">new</span>
  }
  if (value === 0) return <span className="text-ink-faint">—</span>
  const up = value > 0
  return (
    <span className={`numeral inline-flex items-center gap-0.5 text-xs font-bold
                      ${up ? 'text-good-ink' : 'text-bad-ink'}`}
          aria-label={`${up ? 'up' : 'down'} ${Math.abs(value)}`}>
      <svg viewBox="0 0 10 10" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
        {up ? <path d="M5 1 L9.5 8 H0.5 Z" /> : <path d="M5 9 L0.5 2 H9.5 Z" />}
      </svg>
      {Math.abs(value)}
    </span>
  )
}
