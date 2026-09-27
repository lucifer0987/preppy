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
          lede="Every paper that has closed, with its answers and solutions. Open one whether or not you sat it."
        />

        {!failure && rows.length > 0 && (
          <StatRow>
            <Stat label="Papers closed" value={rows.length} />
            <Stat label="You sat" value={sat.length}
                  hint={rows.length > sat.length ? `${rows.length - sat.length} missed` : 'every one'} />
            <Stat label="Best score" value={best === null ? '—' : best.toFixed(2)} tone="zap" />
            <Stat label="Top three finishes" value={podiums} tone={podiums > 0 ? 'good' : 'default'} />
          </StatRow>
        )}

        {failure ? (
          <p role="alert" className="mt-6 rounded-card border border-bad/30 bg-bad/10 p-5 font-semibold text-bad-ink">
            Past papers would not load. Nothing is lost — try again in a moment.
            <span className="mt-1 block text-sm font-normal text-ink-soft">{failure}</span>
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <Empty>
              No paper has finished yet. One appears here the moment it does, with every
              question, its key and a worked solution — whether or not you sat it.
            </Empty>
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li key={r.testId}>
                <Link
                  href={`/archive/${r.testId}`}
                  className="group card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition
                             hover:border-accent/50 hover:shadow-float"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{r.title ?? 'Daily mock'}</span>
                    <span className="numeral mt-0.5 block text-xs text-ink-faint">
                      {formatIstDate(r.date)}
                    </span>
                  </span>

                  <span className="ml-auto flex flex-wrap items-center gap-2.5">
                    {r.attemptId ? (
                      <>
                        {r.rank !== null && r.rank <= 3 && (
                          <span className="numeral text-sm font-bold text-gold">{ordinal(r.rank)}</span>
                        )}
                        <span className="numeral text-lg font-bold text-ink">{r.score?.toFixed(2)}</span>
                        {r.rank !== null ? (
                          <StatusChip tone="done">{ordinal(r.rank)} of {r.cohortSize}</StatusChip>
                        ) : (
                          <span className="text-xs text-ink-faint">ranked when it finishes</span>
                        )}
                      </>
                    ) : (
                      <StatusChip tone="draft">Not attempted</StatusChip>
                    )}
                    <svg viewBox="0 0 16 16" aria-hidden="true"
                         className="h-3.5 w-3.5 fill-ink-faint transition group-hover:fill-accent">
                      <path d="M8.3 2.3a1 1 0 000 1.4L11.6 7H2a1 1 0 100 2h9.6l-3.3 3.3a1 1 0 101.4 1.4l5-5a1 1 0 000-1.4l-5-5a1 1 0 00-1.4 0z" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  )
}
