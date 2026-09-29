import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '../../lib/guard'
import { getArchive } from '../../lib/repo/leaderboard'
import { upcomingPapers } from '../../lib/repo/papers'
import { viewerStateFor } from '../../lib/repo/attempts'
import { OpenPaperList, UpcomingPaperList } from '../../components/PaperLists'
import { viewerTrack } from '../../lib/repo/tracks'
import { formatIstDate } from '../../lib/time'
import { ordinal } from '../../lib/leaderboard'
import { AppShell } from '../../components/AppShell'
import { Empty, PageHeader, Stat, StatRow, StatusChip } from '../../components/Page'

export const metadata: Metadata = { title: 'All papers' }
export const dynamic = 'force-dynamic'

/**
 * Panel 2 (PRD 6.3). Every closed paper is browsable by everyone (FR-6.3.2),
 * attempted or not. Rows carry this student's own score and rank and nothing
 * about anyone else (FR-5.3).
 */
export default async function ArchivePage() {
  const user = await requireUser()
  const track = await viewerTrack(user)
  let rows: Awaited<ReturnType<typeof getArchive>> = []
  let failure: string | null = null
  try {
    if (track) rows = await getArchive(user.id, track.id)
  } catch (e) {
    failure = (e as Error).message
  }

  /**
   * Papers running right now, which this page used to leave out entirely.
   *
   * It listed what had finished, so a student who came here to find a paper
   * found yesterday's. The one they could actually sit was on the dashboard
   * and nowhere else, and "all papers" that omits the open one is the least
   * useful omission available.
   *
   * Only the ones they have not handed in: a finished paper is already below
   * with its score and rank, and getArchive counts it from the moment it is
   * submitted. So the two lists cannot show the same paper twice.
   */
  const now = new Date()
  const scheduled = track ? await upcomingPapers(now, track.id) : null
  const live = scheduled
    ? (await viewerStateFor(scheduled.open, user.id, now)).filter((r) => !r.finished)
    : []
  const later = scheduled?.later ?? []

  // The figures below the title are about what has finished: the gap between
  // what has run and what this student sat.
  const sat = rows.filter((r) => r.attemptId)
  const best = sat.reduce<number | null>((m, r) => {
    const s = r.score ?? null
    return s === null ? m : m === null || s > m ? s : m
  }, null)
  const podiums = sat.filter((r) => r.rank !== null && r.rank <= 3).length

  return (
    <AppShell user={user} current="archive" examName={track?.name}>
      <main className="shell pt-6">
        <PageHeader
          title="All papers"
          lede="What is open now, what is still to come, and every paper that has closed — with its answers and worked solutions."
        />

        {!failure && rows.length > 0 && (
          <StatRow>
            <Stat label="Papers finished" value={rows.length} />
            <Stat label="You sat" value={sat.length}
                  hint={rows.length > sat.length ? `${rows.length - sat.length} you did not` : 'every one'} />
            <Stat label="Best score" value={best === null ? '—' : best.toFixed(2)} tone="zap" />
            <Stat label="Top three finishes" value={podiums} tone={podiums > 0 ? 'good' : 'default'} />
          </StatRow>
        )}

        {live.length > 0 && <OpenPaperList rows={live} />}
        {later.length > 0 && <UpcomingPaperList papers={later} />}

        {failure ? (
          <p role="alert" className="mt-6 rounded-card border border-bad/30 bg-bad/10 p-5 font-semibold text-bad-ink">
            The finished papers would not load. Nothing is lost, and anything open is still above. Try again in a moment.
            <span className="mt-1 block text-sm font-normal text-ink-soft">{failure}</span>
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <Empty>
              Nothing finished yet. Hand a paper in and it turns up here straight away, with
              every question, its key and a worked solution. Once it closes everybody sees it,
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
                  {/* Practice sits before Solutions, because reading the
                      answers first is the thing it exists to be an
                      alternative to. Students only, as on the paper itself:
                      an admin's attempts are dry runs already. */}
                  {user.role === 'student' && (
                    <Link href={`/test/start?test=${r.testId}&practice=1`}
                          className="btn btn-quiet px-4 py-2 text-sm">
                      Practice
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
