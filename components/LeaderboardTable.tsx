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
  rows, meUserId, maxMarks, compact = false,
}: {
  rows: LeaderboardRow[]
  meUserId: string
  /**
   * What a perfect run of the papers in this window is worth, so the Total
   * header can say what a total is out of. Omitted where the window is not on
   * screen to compare it against.
   */
  maxMarks?: number
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
                <Th align="right">
                  Total{maxMarks ? <> of <span className="numeral">{maxMarks}</span></> : null}
                </Th>
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
                        ? <StreakBadge papers={row.currentStreak} />
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
          here is measured over the window above. A streak counts papers, not days: every paper
          that has closed, plus one still open that you have already sat.
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
/**
 * First, second and third, as a podium rather than three cards in a row.
 *
 * The shape carries the meaning: first is the tallest and stands in the
 * middle, second steps down on the left, third down again on the right, and
 * every bottom edge lines up so the steps read as a podium and not as a
 * layout accident. Each place wears its own medal -- gold, silver, bronze --
 * fixed in both themes, because a medal that changed colour with the theme
 * would stop being a medal.
 */
function Podium({ row, delay, me }: { row: LeaderboardRow; delay: number; me: boolean }) {
  const place = row.rank === 1 ? 1 : row.rank === 2 ? 2 : 3
  const look = {
    // The step is a min-height, not padding: a podium whose heights came out
    // of how much was in each card put third above first the moment one of
    // them had a streak badge and the other did not.
    1: {
      order: 'sm:order-2',
      step: 'sm:min-h-[15rem]',
      fill: 'bg-medal-1 text-medal-1-ink shadow-high',
      label: '1st',
    },
    2: {
      order: 'sm:order-1',
      step: 'sm:min-h-[13rem]',
      fill: 'bg-medal-2 text-medal-2-ink shadow-float',
      label: '2nd',
    },
    3: {
      order: 'sm:order-3',
      step: 'sm:min-h-[11.25rem]',
      fill: 'bg-medal-3 text-medal-3-ink shadow-float',
      label: '3rd',
    },
  }[place]

  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className={[
        'relative flex flex-col justify-center overflow-hidden rounded-card p-5 text-center',
        'motion-safe:animate-[rise_420ms_cubic-bezier(.2,.8,.2,1)_both]',
        look.order, look.step, look.fill,
        // The reader's own row is outlined rather than recoloured: the fill is
        // already saying something else.
        me ? 'ring-2 ring-accent ring-offset-2 ring-offset-page' : '',
      ].join(' ')}
    >
      {place === 1 && (
        // One light, from above, so the gold has somewhere to catch.
        <div aria-hidden="true"
             className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/40 blur-2xl" />
      )}
      <p className="relative font-display text-xs font-black uppercase tracking-[0.18em] opacity-85">
        {place === 1 && <span aria-hidden="true" className="mr-1.5">&#9733;</span>}
        {look.label}
      </p>
      <p className="relative mt-2 truncate text-lg font-bold">{row.displayName}</p>
      <p className={`numeral relative mt-1 font-black ${place === 1 ? 'text-4xl' : 'text-3xl'}`}>
        {row.totalPoints.toFixed(2)}
      </p>
      {row.currentStreak > 0 && (
        <p className="relative mt-3 flex justify-center"><StreakBadge papers={row.currentStreak} /></p>
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
