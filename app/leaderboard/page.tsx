import Link from 'next/link'
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm font-bold text-play-purple">&larr; Dashboard</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-ink-soft">
        Cumulative points across every paper. It never resets, and takes in each night&rsquo;s paper
        once it closes.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-2" aria-label="Window">
          {([['All time', undefined], ['Last 7', '7'], ['Last 30', '30']] as const).map(([label, value]) => (
            <Link
              key={label}
              href={value ? `/leaderboard?window=${value}` : '/leaderboard'}
              aria-current={!test && (value ?? undefined) === win ? 'page' : undefined}
              className={[
                'rounded-full px-4 py-2 text-sm font-bold transition',
                !test && (value ?? undefined) === win ? 'bg-play-purple text-white' : 'bg-white text-ink-soft hover:bg-black/5',
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
              className="rounded-full border-2 border-black/10 bg-white px-3 py-1.5 text-sm font-semibold"
            >
              <option value="" disabled>Choose…</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{formatIstDate(p.date)}{p.title ? ` · ${p.title}` : ''}</option>
              ))}
            </select>
            <button className="rounded-full bg-play-purple px-4 py-1.5 text-sm font-bold text-white">Show</button>
          </form>
        )}
      </div>

      <div className="mt-6">
        {failure ? (
          <p role="alert" className="rounded-3xl bg-notanswered p-6 font-semibold text-white">
            The leaderboard could not be loaded just now. Nothing has been lost; try again in a
            moment. ({failure})
          </p>
        ) : test ? (
          <PaperRankList standings={standings} meUserId={user.id} />
        ) : (
          <LeaderboardTable rows={rows} meUserId={user.id} />
        )}
      </div>

      {user.role === 'admin' && (
        <p className="mt-6 rounded-2xl bg-play-yellow/15 px-5 py-4 text-sm">
          You do not appear here. Admin attempts are always dry runs, so they are never counted.
        </p>
      )}
    </main>
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
      <p className="rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
        That paper is not on the board yet. A paper joins it when its own window closes and every attempt on it has had to end.
      </p>
    )
  }
  if (!standings.rows.length) {
    return (
      <p className="rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
        Nobody sat the paper for {formatIstDate(standings.date)}.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-3xl bg-white p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">{formatIstDate(standings.date)}</h2>
      <table className="mt-3 w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
            <th className="py-2 pr-2 font-bold">#</th>
            <th className="py-2 pr-3 font-bold">Student</th>
            <th className="py-2 px-2 text-right font-bold">Score</th>
            <th className="py-2 pl-2 text-right font-bold">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((row) => {
            const me = row.userId === meUserId
            return (
              <tr key={row.userId} className={`border-t border-black/10 ${me ? 'bg-play-purple/10 font-semibold' : ''}`}>
                <td className="py-2.5 pr-2 font-bold">{ordinal(row.rank)}</td>
                <td className="py-2.5 pr-3">
                  {row.displayName}
                  {me && <span className="ml-2 text-[10px] uppercase tracking-widest text-play-purple">you</span>}
                </td>
                <td className="py-2.5 px-2 text-right font-bold">{row.score.toFixed(2)}</td>
                <td className="py-2.5 pl-2 text-right text-ink-soft">
                  {row.accuracyPct === null ? '—' : `${row.accuracyPct.toFixed(0)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
