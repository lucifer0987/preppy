import Link from 'next/link'
import { listPapers } from '../../../lib/repo/papers'
import { formatIstDate, istDate, paperLabels, windowState } from '../../../lib/time'
import { requireAdmin } from '../../../lib/guard'
import { Empty, Flash, PageHeader, StatusChip } from '../../../components/Page'
import { TrackSwitcher } from '../../../components/TrackSwitcher'
import { consoleTrack, listTracks } from '../../../lib/repo/tracks'

export const dynamic = 'force-dynamic'

export default async function PapersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { scheduled, track: slug } = await searchParams
  const [tracks, track] = await Promise.all([listTracks(), consoleTrack(slug)])
  const papers = await listPapers(track?.id)
  const today = istDate()

  return (
      <>
        {scheduled && (
          <Flash tone="good" className="mb-5">
            Scheduled. It runs in the window you picked; open it again to move it back to draft.
          </Flash>
        )}
        <PageHeader compact
        title="Papers"
        lede="Everything drafted or published. Solutions opens the paper itself: every question with its key, and where you correct one, schedule it, rehearse it or manage it once it is out."
        actions={
          <Link href={track ? `/admin/papers/upload?track=${track.slug}` : '/admin/papers/upload'}
                className="btn btn-primary hover:bg-accent-hover">
            Upload a paper
          </Link>
        }
      />

      <TrackSwitcher tracks={tracks} current={track} basePath="/admin/papers" />
      {papers.length === 0 ? (
        <div className="mt-6">
          <Empty>
            No papers on {track?.name ?? 'this exam'} yet. Upload one and it lands here as a
            draft, ready to read through before you give it a day and a window.
          </Empty>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {papers.map((p) => {
            const state = windowState(p.window)
            const label =
              p.status === 'DRAFT' ? 'Draft'
              : p.window.endedAt ? 'Ended early'
              : state === 'BEFORE_OPEN' ? (p.date === today ? 'Opens today' : 'Scheduled')
              : state === 'CLOSED' ? 'Finished'
              : 'Live now'
            const tone =
              label === 'Draft' ? 'draft' as const
              : label === 'Live now' ? 'live' as const
              : label === 'Finished' || label === 'Ended early' ? 'done' as const
              : 'waiting' as const
            const l = paperLabels(p.window)

            return (
              <li key={p.id}
                  className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{p.title ?? 'Untitled'}</span>
                  <span className="numeral mt-0.5 block text-xs text-ink-faint">
                    {formatIstDate(p.date)}
                    {p.status === 'DRAFT'
                      ? ' · not scheduled yet'
                      : p.window.endedAt
                        ? ` · ${l.opens}, ended early`
                        : ` · ${l.opens} to ${l.closes}`}
                    {' · '}{p.questionCount} questions
                    {p.attemptCount > 0 && ` · sat by ${p.attemptCount}`}
                  </span>
                </span>

                <StatusChip tone={tone}>{label}</StatusChip>

                {/* The two things an admin opens a past paper for, as buttons
                    rather than a row-sized link: one target per action beats
                    one target that has to mean both. */}
                <span className="flex flex-wrap items-center gap-2">
                  {p.attemptCount > 0 && (
                    <Link href={`/admin/attempts?test=${p.id}`}
                          className="btn btn-quiet px-4 py-2 text-sm">
                      See results
                    </Link>
                  )}
                  <Link href={`/admin/papers/${p.id}`}
                        className="btn btn-primary px-4 py-2 text-sm">
                    Solutions
                  </Link>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
