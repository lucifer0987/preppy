import Link from 'next/link'
import { listPapers } from '../../../lib/repo/papers'
import { formatIstDate, istDate, windowState } from '../../../lib/time'
import { requireAdmin } from '../../../lib/guard'

export const dynamic = 'force-dynamic'

export default async function PapersPage() {
  await requireAdmin()
  const papers = await listPapers()
  const today = istDate()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black tracking-tight">Papers</h1>
        <Link
          href="/admin/papers/upload"
          className="rounded-2xl bg-play-purple px-5 py-2.5 font-black text-white transition hover:bg-play-purple-deep"
        >
          Upload a paper
        </Link>
      </div>

      {papers.length === 0 ? (
        <p className="mt-8 rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
          No papers yet. Upload one to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {papers.map((p) => {
            const state = windowState(p.date)
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
                  className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-5 py-4 transition hover:bg-black/[0.03]"
                >
                  <span className="font-bold tabular-nums">{formatIstDate(p.date)}</span>
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
