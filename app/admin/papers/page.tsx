import Link from 'next/link'
import { listPapers } from '../../../lib/repo/papers'
import { formatIstDate, istDate, paperLabels, windowState } from '../../../lib/time'
import { requireAdmin } from '../../../lib/guard'
import { Empty, Flash, PageHeader, StatusChip } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function PapersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { scheduled } = await searchParams
  const papers = await listPapers()
  const today = istDate()

  return (
      <>
        {scheduled && (
          <Flash tone="good" className="mb-5">
            Scheduled. It is live on the night you picked; open it again to move it back to draft.
          </Flash>
        )}
        <PageHeader compact
        title="Papers"
        lede="Everything drafted or published. Open one to preview it, correct a key, or rehearse it as a dry run."
        actions={
          <Link href="/admin/papers/upload" className="btn btn-primary hover:bg-accent-hover">
            Upload a paper
          </Link>
        }
      />
      {papers.length === 0 ? (
        <div className="mt-6">
          <Empty>
            No papers yet. Upload one and it lands here as a draft, ready to read through
            before you give it a night.
          </Empty>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {papers.map((p) => {
            const state = windowState(p.window)
            const label =
              p.status === 'DRAFT' ? 'Draft'
              : state === 'BEFORE_OPEN' ? (p.date === today ? 'Live tonight' : 'Scheduled')
              : state === 'CLOSED' ? 'Finished'
              : 'Live now'
            const tone =
              label === 'Draft' ? 'draft' as const
              : label === 'Live now' ? 'live' as const
              : label === 'Finished' ? 'done' as const
              : 'waiting' as const
            const l = paperLabels(p.window)

            return (
              <li key={p.id}>
                <Link
                  href={`/admin/papers/${p.id}`}
                  className="group card flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4
                             transition hover:border-accent/50 hover:shadow-float"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{p.title ?? 'Untitled'}</span>
                    <span className="numeral mt-0.5 block text-xs text-ink-faint">
                      {formatIstDate(p.date)}
                      {p.status === 'DRAFT' ? ' · no night yet' : ` · ${l.opens} to ${l.closes}`}
                    </span>
                  </span>
                  <span className="numeral text-sm text-ink-soft">
                    {p.questionCount} questions
                  </span>
                  <StatusChip tone={tone}>{label}</StatusChip>
                  <svg viewBox="0 0 16 16" aria-hidden="true"
                       className="h-3.5 w-3.5 shrink-0 fill-ink-faint transition group-hover:fill-accent">
                    <path d="M8.3 2.3a1 1 0 000 1.4L11.6 7H2a1 1 0 100 2h9.6l-3.3 3.3a1 1 0 101.4 1.4l5-5a1 1 0 000-1.4l-5-5a1 1 0 00-1.4 0z" />
                  </svg>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
