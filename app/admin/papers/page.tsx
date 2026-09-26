import Link from 'next/link'
import { listPapers } from '../../../lib/repo/papers'
import { formatIstDate, istDate, paperLabels, windowState } from '../../../lib/time'
import { requireAdmin } from '../../../lib/guard'
import { BackLink, PageHeader } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function PapersPage() {
  await requireAdmin()
  const papers = await listPapers()
  const today = istDate()

  return (
    <>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        title="Papers"
        lede="Everything drafted or published. Open one to preview it, correct a key, or rehearse it as a dry run."
        actions={
          <Link href="/admin/papers/upload" className="btn btn-primary hover:bg-accent-hover">
            Upload a paper
          </Link>
        }
      />
      {papers.length === 0 ? (
        <p className="mt-8 rounded-card border border-dashed border-line-strong p-8 text-center text-ink-soft">
          No papers yet. Upload one to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {papers.map((p) => {
            const state = windowState(p.window)
            const label =
              p.status === 'DRAFT' ? 'Draft'
              : state === 'BEFORE_OPEN' ? (p.date === today ? 'Live tonight' : 'Scheduled')
              : state === 'CLOSED' ? 'Finished'
              : 'Live now'
            const tone =
              p.status === 'DRAFT' ? 'bg-ink-soft'
              : label === 'Live now' ? 'bg-notanswered'
              : label === 'Finished' ? 'bg-ink-soft/60'
              : 'bg-answered'

            return (
              <li key={p.id}>
                <Link
                  href={`/admin/papers/${p.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-control bg-surface px-5 py-4 transition hover:bg-surface-sunken"
                >
                  <span className="font-bold tabular-nums">{formatIstDate(p.date)}</span>
                  <span className="text-xs tabular-nums text-ink-soft">{paperLabels(p.window).opens}</span>
                  <span className="text-ink-soft">{p.title ?? 'Untitled'}</span>
                  <span className="ml-auto text-sm tabular-nums text-ink-soft">{p.questionCount} q</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white ${tone}`}>
                    {label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
