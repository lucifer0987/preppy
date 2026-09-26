import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { getPattern, getPatternMeta, getWindow } from '../../../lib/repo/settings'
import { patternTotals, SECTION_NAMES } from '../../../lib/types'
import { PatternForm } from './PatternForm'

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
      <Link href="/admin" className="text-sm font-bold text-play-purple">&larr; Admin</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Paper pattern</h1>
      <p className="mt-1 text-ink-soft">
        How many questions each section holds, how long it runs, and what a right or wrong answer is
        worth. This is the shape a paper takes when its file does not say otherwise &mdash; papers
        already uploaded keep the shape they were given.
      </p>

      <section className="mt-6 rounded-3xl bg-play-purple p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">A paper on this pattern</p>
        <p className="mt-2 text-2xl font-black tabular-nums">
          {totals.questions} questions &middot; {totals.minutes} minutes
        </p>
        <p className="mt-1 tabular-nums text-white/70">
          {totals.maxMarks} marks for a perfect paper, {totals.minMarks} for every answer wrong.
        </p>
        <ul className="mt-3 space-y-1 text-sm tabular-nums text-white/70">
          {current.map((s) => (
            <li key={s.code}>
              {SECTION_NAMES[s.code]} &mdash; {s.questions} q, {s.minutes} min, +{s.marksCorrect} / &minus;{s.marksNegative}
            </li>
          ))}
        </ul>
        {meta.updatedAt && (
          <p className="mt-3 text-xs text-white/50">
            Last changed {new Date(meta.updatedAt).toLocaleString('en-IN')}
            {meta.updatedBy ? ` by ${meta.updatedBy}` : ''}
          </p>
        )}
      </section>

      <PatternForm current={current} latestEntryClose={latestEntryClose} />

      <section className="mt-6 rounded-3xl bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Start a paper from this pattern</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A blank file with the right sections, counts, numbering and marking, and placeholder text
          everywhere the content goes. Built from the pattern above, so it follows any change you make
          here. The checker refuses a placeholder left in, so an unedited one can never go live.
        </p>
        <a
          href="/api/admin/template"
          className="mt-3 inline-block rounded-2xl bg-play-purple px-6 py-3 font-black text-white
                     transition hover:bg-play-purple-deep"
        >
          Download a blank template
        </a>
      </section>

      <section className="mt-6 rounded-3xl border-2 border-dashed border-black/10 p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
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
        <Link href="/admin/window" className="font-bold text-play-purple underline">Nightly window &rarr;</Link>{' '}
        <span className="text-ink-soft">
          when papers open and the last moment to start. A longer pattern needs entry to close earlier,
          so the two are worth checking together.
        </span>
      </p>
    </>
  )
}
