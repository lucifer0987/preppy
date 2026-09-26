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
        When a paper unlocks, and the last moment somebody may start one. These times appear on the
        home page, the dashboard and the briefing, and they decide who is let in.
      </p>

      <section className="mt-6 rounded-3xl bg-play-purple p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Right now</p>
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
          <li>An attempt already running keeps the deadline it started with.</li>
          <li>Papers already scheduled keep their dates; only the hours move.</li>
          <li>Answers still unlock at midnight, and the leaderboard still takes a paper in at 00:01.</li>
          <li>The nightly job still runs at 00:05.</li>
        </ul>
      </section>
    </>
  )
}
