import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { getWindow, getWindowMeta } from '../../../lib/repo/settings'
import { defaultAttemptMinutes } from '../../../lib/repo/tracks'
import { formatIstMoment, windowLabels } from '../../../lib/time'
import { WindowForm } from './WindowForm'
import { PageHeader } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function WindowPage() {
  // The layout checks too, but a layout does not re-run on every
  // navigation, so the page is where the guarantee actually lives.
  await requireAdmin()
  const current = await getWindow()
  const meta = await getWindowMeta()
  // How long a paper built to the current default pattern runs: it is what
  // decides the hard stop, so the latest entry close depends on it.
  const attemptMinutes = await defaultAttemptMinutes()
  const labels = windowLabels(current, attemptMinutes)

  return (
    <>
      <PageHeader compact title="Default times" lede="The times a paper is given when you schedule it without picking any. Each paper keeps its own from then on." />

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        {[['Unlocks', labels.opens], ['Last entry', labels.closes],
          ['Everyone finished by', labels.hardStop], ['Runs for', `${attemptMinutes} min`]].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="eyebrow">{k}</dt>
            <dd className="numeral mt-0.5 text-xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      {meta.updatedAt && (
        <p className="mt-3 text-xs text-ink-faint">
          Last changed {formatIstMoment(meta.updatedAt)}
          {meta.updatedBy ? ` by ${meta.updatedBy}` : ''}
        </p>
      )}

      <WindowForm current={current} attemptMinutes={attemptMinutes} />

      <p className="mt-6 text-sm">
        <Link href="/admin/pattern" className="font-bold text-accent underline">
          Paper pattern &rarr;
        </Link>{' '}
        <span className="text-ink-soft">
          questions, minutes and marking per section. Changing the pattern changes how long a
          paper runs, and so the latest entry close these times may use.
        </span>
      </p>

      <section className="mt-6 rounded-card border border-dashed border-line p-5">
        <h2 className="eyebrow">
          What changing these does not affect
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          <li>Papers already scheduled keep the window they were given.</li>
          <li>An attempt already running keeps the deadline it started with.</li>
          <li>Each paper's answers unlock, and it joins the leaderboard, at its own closing time.</li>
          <li>The finalise job still runs at 1 PM and 1 AM.</li>
        </ul>
      </section>
    </>
  )
}
