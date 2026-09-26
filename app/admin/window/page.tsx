import Link from 'next/link'
import { getWindow, getWindowMeta } from '../../../lib/repo/settings'
import { ATTEMPT_MINUTES, windowLabels } from '../../../lib/time'
import { WindowForm } from './WindowForm'

export const dynamic = 'force-dynamic'

export default async function WindowPage() {
  const current = await getWindow()
  const meta = await getWindowMeta()
  const labels = windowLabels(current)

  return (
    <>
      <Link href="/admin" className="text-sm font-bold text-play-purple">&larr; Admin</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Nightly window</h1>
      <p className="mt-1 text-ink-soft">
        The times a new paper is offered when you schedule it. Each paper keeps its own window, so
        changing these does not move anything already scheduled &mdash; and a day can hold more than
        one paper as long as their windows do not overlap.
      </p>

      <section className="mt-6 rounded-3xl bg-play-purple p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Offered by default</p>
        <p className="mt-2 text-2xl font-black">
          {labels.opens} &rarr; {labels.closes}
        </p>
        <p className="mt-1 text-white/70">
          Everyone is finished by {labels.hardStop}. One paper runs {ATTEMPT_MINUTES} minutes.
        </p>
        {meta.updatedAt && (
          <p className="mt-3 text-xs text-white/50">
            Last changed {new Date(meta.updatedAt).toLocaleString('en-IN')}
            {meta.updatedBy ? ` by ${meta.updatedBy}` : ''}
          </p>
        )}
      </section>

      <WindowForm current={current} />

      <section className="mt-6 rounded-3xl border-2 border-dashed border-black/10 p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          What changing these does not affect
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          <li>Papers already scheduled keep the window they were given.</li>
          <li>An attempt already running keeps the deadline it started with.</li>
          <li>Each paper's answers unlock, and it joins the leaderboard, at its own closing time.</li>
          <li>The daily job still runs at 3 AM.</li>
        </ul>
      </section>
    </>
  )
}
