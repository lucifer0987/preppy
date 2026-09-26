import Link from 'next/link'
import { requireUser } from '../../lib/guard'
import { getArchive } from '../../lib/repo/leaderboard'
import { formatIstDate } from '../../lib/time'
import { ordinal } from '../../lib/leaderboard'

export const dynamic = 'force-dynamic'

/**
 * Panel 2 (PRD 6.3). Every closed paper is browsable by everyone (FR-6.3.2),
 * attempted or not. Rows carry this student's own score and rank and nothing
 * about anyone else (FR-5.3).
 */
export default async function ArchivePage() {
  const user = await requireUser()
  let rows: Awaited<ReturnType<typeof getArchive>> = []
  let failure: string | null = null
  try {
    rows = await getArchive(user.id)
  } catch (e) {
    failure = (e as Error).message
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="text-sm font-bold text-play-purple">&larr; Dashboard</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Past papers</h1>
      <p className="mt-1 text-ink-soft">
        Every paper that has closed, with answers and solutions. Open one whether or not you sat it.
      </p>

      {failure ? (
        <p role="alert" className="mt-8 rounded-card bg-notanswered p-6 font-semibold text-white">
          Past papers could not be loaded just now. Try again in a moment. ({failure})
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-card border-2 border-dashed border-line-strong p-8 text-center text-ink-soft">
          No papers have closed yet. They appear here from midnight on the night they run.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => (
            <li key={r.testId}>
              <Link
                href={`/archive/${r.testId}`}
                className="flex flex-wrap items-center gap-4 rounded-control bg-surface px-5 py-4 transition hover:bg-surface-sunken"
              >
                <span className="font-bold">{formatIstDate(r.date)}</span>
                <span className="text-ink-soft">{r.title ?? 'Daily mock'}</span>
                <span className="ml-auto flex items-center gap-3 text-sm tabular-nums">
                  {r.attemptId ? (
                    <>
                      <span className="rounded-full bg-answered px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                        Attempted
                      </span>
                      <span className="font-bold">{r.score?.toFixed(2)}</span>
                      {r.rank !== null ? (
                        <span className="rounded-full bg-play-purple px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                          {ordinal(r.rank)} of {r.cohortSize}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-soft">rank at 12:01 AM</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-surface-sunken border border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
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
