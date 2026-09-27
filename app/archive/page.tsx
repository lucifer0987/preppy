import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '../../lib/guard'
import { getArchive } from '../../lib/repo/leaderboard'
import { formatIstDate } from '../../lib/time'
import { ordinal } from '../../lib/leaderboard'
import { AppShell } from '../../components/AppShell'
import { Empty, PageHeader, Stat, StatRow, StatusChip } from '../../components/Page'

export const metadata: Metadata = { title: 'Past papers' }
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

  // Worth stating at the top: the gap between what has run and what you sat is
  // the whole point of this page.
  const sat = rows.filter((r) => r.attemptId)
  const best = sat.reduce<number | null>((m, r) => {
    const s = r.score ?? null
    return s === null ? m : m === null || s > m ? s : m
  }, null)
  const podiums = sat.filter((r) => r.rank !== null && r.rank <= 3).length

  return (
    <AppShell user={user} current="archive">
      <main className="shell pt-6">
        <PageHeader
          title="Past papers"
          lede="Every paper you have sat, and every paper that has closed, with its answers and worked solutions."
        />

        {!failure && rows.length > 0 && (
          <StatRow>
            <Stat label="Papers here" value={rows.length} />
            <Stat label="You sat" value={sat.length}
                  hint={rows.length > sat.length ? `${rows.length - sat.length} you did not` : 'every one'} />
            <Stat label="Best score" value={best === null ? '—' : best.toFixed(2)} tone="zap" />
            <Stat label="Top three finishes" value={podiums} tone={podiums > 0 ? 'good' : 'default'} />
          </StatRow>
        )}

        {failure ? (
          <p role="alert" className="mt-6 rounded-card border border-bad/30 bg-bad/10 p-5 font-semibold text-bad-ink">
            Past papers would not load. Nothing is lost. Try again in a moment.
            <span className="mt-1 block text-sm font-normal text-ink-soft">{failure}</span>
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <Empty>
              Nothing here yet. Hand a paper in and it turns up here straight away, with every
              question, its key and a worked solution. Once it closes everybody sees it,
              whether they sat it or not.
            </Empty>
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li key={r.testId}
                  className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{r.title ?? 'Daily mock'}</span>
                  <span className="numeral mt-0.5 block text-xs text-ink-faint">
                    {formatIstDate(r.date)}
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-2.5">
                  {r.attemptId ? (
                    <>
                      <span className="numeral text-lg font-bold text-ink">{r.score?.toFixed(2)}</span>
                      {r.rank !== null && (
                        // The place was printed twice, once in gold and once
                        // in the chip beside it.
                        <StatusChip tone={r.rank <= 3 ? 'good' : r.settled ? 'done' : 'waiting'}>
                          {ordinal(r.rank)} of {r.cohortSize}{r.settled ? '' : ' so far'}
                        </StatusChip>
                      )}
                    </>
                  ) : (
                    <StatusChip tone="draft">Not attempted</StatusChip>
                  )}
                </span>

                {/* One target per action. The row used to be a single link to
                    the solutions, which meant the result -- the thing a
                    student comes back for most -- had no way in from here at
                    all. */}
                <span className="flex flex-wrap items-center gap-2">
                  {r.attemptId && (
                    <Link href={`/test/${r.attemptId}/done`}
                          className="btn btn-quiet px-4 py-2 text-sm">
                      See result
                    </Link>
                  )}
                  <Link href={`/archive/${r.testId}`}
                        className="btn btn-primary px-4 py-2 text-sm">
                    Solutions
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  )
}
