import Link from 'next/link'
import { AppShell } from '../../components/AppShell'
import { PageHeader, Flash, TableShell, Th } from '../../components/Page'
import { requireUser } from '../../lib/guard'
import { boardPapers, getLeaderboard, getPaperStandings } from '../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import { ordinal } from '../../lib/leaderboard'
import { formatIstDate } from '../../lib/time'

export const dynamic = 'force-dynamic'

/**
 * The leaderboard (PRD 6.7): all time by default, the last 30 papers, or one
 * paper's own rank list. It takes in each night's paper at 00:01.
 */
export default async function LeaderboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()

  const { window: win, test } = await searchParams
  const lastN = win === '30' ? 30 : win === '7' ? 7 : undefined

  // A failed read must say so. Rendering it as an empty board would tell
  // everyone the history had been wiped.
  let failure: string | null = null
  let rows: Awaited<ReturnType<typeof getLeaderboard>> = []
  let standings: Awaited<ReturnType<typeof getPaperStandings>> = null
  let papers: Awaited<ReturnType<typeof boardPapers>> = []
  try {
    ;[papers, rows, standings] = await Promise.all([
      boardPapers(),
      test ? Promise.resolve([]) : getLeaderboard(lastN ? { lastN } : {}),
      test ? getPaperStandings(test) : Promise.resolve(null),
    ])
  } catch (e) {
    failure = (e as Error).message
  }


  return (
    <AppShell user={user} current="leaderboard">
    <main className="shell pt-6">
      <PageHeader
        title="Leaderboard"
        lede="Cumulative points across every paper. It never resets, and takes each paper in once that paper closes."
      />

      <div className="card mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <nav className="flex flex-wrap gap-1" aria-label="Window">
          {/* Counted in papers, not days: a day may hold more than one, so the
                label says which. */}
            {([['All time', undefined], ['Last 7 papers', '7'], ['Last 30 papers', '30']] as const)
              .map(([label, value]) => (
            <Link
              key={label}
              href={value ? `/leaderboard?window=${value}` : '/leaderboard'}
              aria-current={!test && (value ?? undefined) === win ? 'page' : undefined}
              className={[
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                !test && (value ?? undefined) === win
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
              ].join(' ')}
            >
              {label}
            </Link>
          ))}
        </nav>
        {papers.length > 0 && (
          <form method="get" action="/leaderboard" className="flex items-center gap-2">
            <label htmlFor="paper" className="text-sm font-bold text-ink-soft">One paper</label>
            <select
              id="paper" name="test" defaultValue={test ?? ''}
              className="field w-auto rounded-full px-3 py-1.5 text-sm font-semibold"
            >
              <option value="" disabled>Choose…</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{formatIstDate(p.date)}{p.title ? ` · ${p.title}` : ''}</option>
              ))}
            </select>
            <button className="pill-brand px-4 py-1.5 text-sm">Show</button>
          </form>
        )}
      </div>

      <div className="mt-6">
        {failure ? (
          <Flash tone="bad">
            The board would not load. Every score is still recorded — it is the reading of
            them that failed. Try again in a moment. ({failure})
          </Flash>
        ) : test ? (
          <PaperRankList standings={standings} meUserId={user.id} />
        ) : (
          <LeaderboardTable rows={rows} meUserId={user.id} />
        )}
      </div>

      {user.role === 'admin' && (
        <p className="mt-6 rounded-control bg-play-yellow/15 px-5 py-4 text-sm">
          You do not appear here. Admin attempts are always dry runs, so they are never counted.
        </p>
      )}
    </main>
    </AppShell>
  )
}

/** One paper's standings: rank by score alone, equal scores sharing a place. */
function PaperRankList({
  standings, meUserId,
}: {
  standings: Awaited<ReturnType<typeof getPaperStandings>>
  meUserId: string
}) {
  if (!standings) {
    return (
      <p className="rounded-card border border-dashed border-line-strong p-8 text-center text-ink-soft">
        That paper is not on the board yet. A paper joins it when its own window closes and every attempt on it has had to end.
      </p>
    )
  }
  if (!standings.rows.length) {
    return (
      <p className="rounded-card border border-dashed border-line-strong p-8 text-center text-ink-soft">
        Nobody sat the paper for {formatIstDate(standings.date)}.
      </p>
    )
  }
  return (
    <div>
      {/* The date heading used to sit inside the scroll container and slid out
          of view with the table. */}
      <h2 className="eyebrow">{formatIstDate(standings.date)}</h2>
      <div className="mt-3">
        <TableShell minWidth="26rem">
          <thead>
            <tr className="border-b border-line">
              <Th>#</Th>
              <Th>Student</Th>
              <Th align="right">Score</Th>
              <Th align="right">Accuracy</Th>
            </tr>
          </thead>
          <tbody className="numeral">
            {standings.rows.map((row) => {
              const me = row.userId === meUserId
              return (
                <tr key={row.userId}
                    className={`border-b border-line last:border-0 ${me ? 'bg-accent/10 font-semibold' : ''}`}>
                  <td className="px-3 py-2.5 font-bold">{ordinal(row.rank)}</td>
                  <td className="px-3 py-2.5 font-display">
                    {row.displayName}
                    {me && <span className="ml-2 text-[10px] uppercase tracking-widest text-accent">you</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold">{row.score.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-soft">
                    {row.accuracyPct === null ? '—' : `${row.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      </div>
    </div>
  )
}
