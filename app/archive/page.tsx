import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '../../lib/auth'
import { getArchive } from '../../lib/repo/leaderboard'
import { formatIstDate } from '../../lib/time'

export const dynamic = 'force-dynamic'

/**
 * Panel 2 (PRD 6.3). Every closed paper is browsable by everyone (FR-6.3.2),
 * attempted or not. Rows carry this student's own score and rank and nothing
 * about anyone else (FR-5.3).
 */
export default async function ArchivePage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const rows = await getArchive(user.id)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="text-sm font-bold text-play-purple">&larr; Dashboard</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Past papers</h1>
      <p className="mt-1 text-ink-soft">
        Every paper that has closed, with answers and solutions. Open one whether or not you sat it.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
          No papers have closed yet. They appear here from midnight on the night they run.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => (
            <li key={r.testId}>
              <Link
                href={`/archive/${r.testId}`}
                className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-5 py-4 transition hover:bg-black/[0.03]"
              >
                <span className="font-bold">{formatIstDate(r.date)}</span>
                <span className="text-ink-soft">{r.title ?? 'Daily mock'}</span>
                <span className="ml-auto flex items-center gap-3 text-sm tabular-nums">
                  {r.attemptId ? (
                    <>
                      <span className="font-bold">{r.score?.toFixed(2)}</span>
                      <span className="rounded-full bg-play-purple px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                        {ordinal(r.rank!)} of {r.cohortSize}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                      Not attempted
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!)
}
