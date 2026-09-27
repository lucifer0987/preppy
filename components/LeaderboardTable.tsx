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
 * layout accident. The step is a min-height rather than padding, because
 * heights that came out of content put third above first the moment one card
 * had a streak badge and another did not.
 *
 * All three are the deep panel the winner's card always was, lit from a
 * different corner in their own metal. Painting second and third as flat
 * silver and bronze rectangles made the row read as three swatches; the panel
 * with light in it is the thing that looked like a prize, so all three get it
 * and the medal is in the glow, the rule along the top and the place label.
 * First keeps what it had: two lights rather than one, a star, and the largest
 * score on the page.
 */
function Podium({ row, delay, me }: { row: LeaderboardRow; delay: number; me: boolean }) {
  const place = row.rank === 1 ? 1 : row.rank === 2 ? 2 : 3
  const look = {
    1: { order: 'sm:order-2', step: 'sm:min-h-[15rem]', shadow: 'shadow-high',
         rule: 'bg-medal-1', chip: 'bg-medal-1 text-medal-1-ink', label: '1st' },
    2: { order: 'sm:order-1', step: 'sm:min-h-[13rem]', shadow: 'shadow-float',
         rule: 'bg-medal-2', chip: 'bg-medal-2 text-medal-2-ink', label: '2nd' },
    3: { order: 'sm:order-3', step: 'sm:min-h-[11.25rem]', shadow: 'shadow-float',
         rule: 'bg-medal-3', chip: 'bg-medal-3 text-medal-3-ink', label: '3rd' },
  }[place]

  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className={[
        'relative flex flex-col justify-center overflow-hidden rounded-card p-5 text-center',
        'bg-surface-invert text-white',
        'motion-safe:animate-[rise_420ms_cubic-bezier(.2,.8,.2,1)_both]',
        look.order, look.step, look.shadow,
        // The reader's own card is outlined rather than recoloured: the panel
        // is already saying something else.
        me ? 'ring-2 ring-accent ring-offset-2 ring-offset-page' : '',
      ].join(' ')}
    >
      {/* The metal along the top edge, and again as the place itself. Left as
          coloured text on the panel, silver and bronze were nearly the same
          violet as each other; filled, there is no mistaking which is which. */}
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${look.rule}`} />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {place === 1 ? (
          <>
            {/* Two lights: gold for the rank, zap for the fact that somebody
                is winning. One light alone read as merely dark. */}
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-medal-1/40 blur-2xl" />
            <div className="absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-zap-500/25 blur-2xl" />
          </>
        ) : (
          <div className={`absolute -right-10 -top-14 h-40 w-40 rounded-full blur-2xl ${
            place === 2 ? 'bg-medal-2/25' : 'bg-medal-3/28'}`} />
        )}
      </div>

      <p className="relative">
        <span className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 font-display
                          text-xs font-black uppercase tracking-[0.14em] ${look.chip}`}>
          {place === 1 && <span aria-hidden="true">&#9733;</span>}
          {look.label}
        </span>
      </p>
      <p className="relative mt-2 truncate text-lg font-bold text-white">{row.displayName}</p>
      <p className={`numeral relative mt-1 font-black text-white ${place === 1 ? 'text-4xl' : 'text-3xl'}`}>
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
