import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { getWindow } from '../../../lib/repo/settings'
import { consoleTrack, getPattern, getPatternMeta, listTracks } from '../../../lib/repo/tracks'
import { patternTotals } from '../../../lib/types'
import { formatIstMoment } from '../../../lib/time'
import { PatternForm } from './PatternForm'
import { PageHeader } from '../../../components/Page'
import { TrackSwitcher } from '../../../components/TrackSwitcher'

export const dynamic = 'force-dynamic'

export default async function PatternPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  // The layout checks too, but a layout does not re-run on every
  // navigation, so the page is where the guarantee actually lives.
  await requireAdmin()
  const { track: slug } = await searchParams
  const [tracks, track] = await Promise.all([listTracks(), consoleTrack(slug)])
  const current = await getPattern(track?.id)
  const meta = track ? await getPatternMeta(track.id) : { updatedAt: null, updatedBy: null }
  const window = await getWindow()
  const totals = patternTotals(current)
  const latestEntryClose = window.entryCloseHour * 60 + window.entryCloseMinute

  return (
    <>
      <PageHeader compact title="Paper pattern"
                  lede="Which sections a paper has, in what order, and what each is worth. This is what a paper is given when its file does not say; papers already uploaded keep their own shape." />

      <TrackSwitcher tracks={tracks} current={track} basePath="/admin/pattern" />

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        {[['Sections', String(current.length)], ['Questions', String(totals.questions)],
          ['Minutes', String(totals.minutes)], ['Perfect paper', String(totals.maxMarks)]].map(([k, v]) => (
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

      {track ? (
        <PatternForm key={track.id} trackId={track.id} current={current}
                     latestEntryClose={latestEntryClose} />
      ) : (
        <p className="mt-4 card p-5 text-sm text-ink-soft">
          There is no track yet, so there is no pattern to edit.{' '}
          <Link href="/admin/tracks" className="font-bold text-accent underline">Add one</Link>.
        </p>
      )}

      <section className="mt-6 card p-5">
        <h2 className="eyebrow">Start a paper from this pattern</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A blank file with the right sections, counts, numbering and marking, and placeholder text
          everywhere the content goes. Built from the pattern above, so it follows any change you make
          here. The checker refuses a placeholder left in, so an unedited one can never go live.
        </p>
        <a
          href={track ? `/api/admin/template?track=${track.slug}` : '/api/admin/template'}
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
          <li>Other exams. Each one has a pattern of its own, and nothing here reaches them.</li>
        </ul>
      </section>

      <p className="mt-6 text-sm">
        <Link href="/admin/window" className="font-bold text-accent underline">Default times &rarr;</Link>{' '}
        <span className="text-ink-soft">
          when papers open and the last moment to start. A longer pattern needs entry to close earlier,
          so the two are worth checking together.
        </span>
      </p>
    </>
  )
}
