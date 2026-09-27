import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { getPattern, getPatternMeta, getWindow } from '../../../lib/repo/settings'
import { patternTotals, SECTION_NAMES } from '../../../lib/types'
import { PatternForm } from './PatternForm'
import { PageHeader } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function PatternPage() {
  // The layout checks too, but a layout does not re-run on every
  // navigation, so the page is where the guarantee actually lives.
  await requireAdmin()
  const current = await getPattern()
  const meta = await getPatternMeta()
  const window = await getWindow()
  const totals = patternTotals(current)
  const latestEntryClose = window.entryCloseHour * 60 + window.entryCloseMinute

  return (
    <>
      <PageHeader compact title="Paper pattern" lede="What a paper is given when its file does not say. Papers already uploaded keep their own shape." />

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        {[['Questions', String(totals.questions)], ['Minutes', String(totals.minutes)],
          ['Perfect paper', String(totals.maxMarks)], ['All wrong', String(totals.minMarks)]].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="eyebrow">{k}</dt>
            <dd className="numeral mt-0.5 text-xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="numeral mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {current.map((s) => (
          <li key={s.code} className="flex items-baseline justify-between gap-3 rounded-control
                                      border border-line bg-surface px-3 py-2">
            <span className="truncate font-display font-semibold">{SECTION_NAMES[s.code]}</span>
            <span className="shrink-0 text-xs text-ink-faint">
              {s.questions} q &middot; {s.minutes} min &middot; +{s.marksCorrect}/&minus;{s.marksNegative}
            </span>
          </li>
        ))}
      </ul>
      {meta.updatedAt && (
        <p className="mt-2 text-xs text-ink-faint">
          Last changed {new Date(meta.updatedAt).toLocaleString('en-IN')}
          {meta.updatedBy ? ` by ${meta.updatedBy}` : ''}
        </p>
      )}

      <PatternForm current={current} latestEntryClose={latestEntryClose} />

      <section className="mt-6 card p-5">
        <h2 className="eyebrow">Start a paper from this pattern</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A blank file with the right sections, counts, numbering and marking, and placeholder text
          everywhere the content goes. Built from the pattern above, so it follows any change you make
          here. The checker refuses a placeholder left in, so an unedited one can never go live.
        </p>
        <a
          href="/api/admin/template"
          className="btn btn-primary mt-3"
        >
          Download a blank template
        </a>
      </section>

      <section className="mt-6 rounded-card border border-dashed border-line p-5">
        <h2 className="eyebrow">
          What changing this does not affect
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          <li>Papers already uploaded keep their own counts, durations and marking.</li>
          <li>Scores already recorded are not recalculated. Correct a key on the paper to rescore it.</li>
          <li>An attempt already running keeps the deadline it started with.</li>
          <li>
            The four sections and the order they are sat in are fixed &mdash; they are the exam&rsquo;s
            pattern, not a setting.
          </li>
        </ul>
      </section>

      <p className="mt-6 text-sm">
        <Link href="/admin/window" className="font-bold text-accent underline">Nightly window &rarr;</Link>{' '}
        <span className="text-ink-soft">
          when papers open and the last moment to start. A longer pattern needs entry to close earlier,
          so the two are worth checking together.
        </span>
      </p>
    </>
  )
}
