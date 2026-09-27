import { UploadForm } from './UploadForm'
import { requireAdmin } from '../../../../lib/guard'
import { BackLink, Flash, PageHeader } from '../../../../components/Page'
import { getPaperById, paperLock } from '../../../../lib/repo/papers'
import { formatIstDate } from '../../../../lib/time'
import { consoleTrack, getTrack, listTracks } from '../../../../lib/repo/tracks'

export const dynamic = 'force-dynamic'

export default async function UploadPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  // `?replace=` turns this screen into "here is a corrected version of that
  // paper": same checks, same format, but the result goes into the paper that
  // already exists instead of making another one.
  const { replace, track: slug } = await searchParams
  const target = replace ? await getPaperById(replace) : null
  const lock = replace && target ? await paperLock(replace) : null
  const tracks = await listTracks()
  // A replacement goes back on the paper's own exam, whatever the URL says:
  // the questions are being swapped, not moved.
  const chosen = lock ? await getTrack(lock.trackId) : await consoleTrack(slug)

  if (replace && (!target || !lock)) {
    return (
      <>
        <BackLink href="/admin/papers">Papers</BackLink>
        <Flash tone="bad" className="mt-4">That paper no longer exists.</Flash>
      </>
    )
  }

  if (target && lock) {
    return (
      <>
        <BackLink href={`/admin/papers/${replace}`}>Back to the paper</BackLink>
        <PageHeader
          compact
          title="Replace the questions"
          meta={<span className="numeral">{target.paper.title ?? 'Untitled'} &middot; {formatIstDate(lock.date)}</span>}
          lede="Upload the corrected file. The paper keeps its day, its window and its place in the schedule; only what is inside it changes."
        />
        {lock.realAttempts > 0 ? (
          <Flash tone="bad" className="mt-5">
            {lock.realAttempts} student{lock.realAttempts === 1 ? ' has' : 's have'} already sat this
            paper, so its questions cannot be swapped underneath them. Delete it and upload the new
            one as a fresh paper.
          </Flash>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
            <UploadForm replaceId={replace} defaultTitle={target.paper.title ?? ''}
                        trackSlug={chosen?.slug} />
            <aside className="card p-5">
              <h2 className="eyebrow">What this changes</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
                <li><span className="font-semibold text-ink">Every question goes</span> and the ones in this file take their place.</li>
                <li><span className="font-semibold text-ink">The day does not move.</span> The file must carry the same date, {formatIstDate(lock.date)}.</li>
                <li><span className="font-semibold text-ink">Images are replaced too</span>, so send them again with the file.</li>
                <li><span className="font-semibold text-ink">Nobody has sat it</span>, which is the only reason this is allowed at all.</li>
              </ul>
            </aside>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {/* One sentence, not two saying the same thing: the lede used to promise
          "nothing is saved unless every rule passes" and the paragraph under it
          repeated that it is checked before anything is saved. */}
      <PageHeader
        compact
        title="Upload a paper"
        lede="The paper as one JSON file, with its images alongside. It is checked before anything is written, and saved as a draft even when it passes."
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <UploadForm tracks={tracks} trackSlug={chosen?.slug} />

        {/* A screen used once a day at most, so it says what happens next
            rather than assuming it is remembered. */}
        <aside className="card p-5">
          <h2 className="eyebrow">What happens next</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {[
              ['Checked', 'Every rule in the format runs before a row is written. Errors block it; warnings do not.'],
              ['Saved as a draft', 'A draft is invisible to students. Nothing about it is live.'],
              ['Read it through', 'The next screen shows every question exactly as a student will see it.'],
              ['Scheduled by you', 'It only goes live when you pick the day and window and confirm you have read it.'],
            ].map(([h, b], i) => (
              <li key={h} className="flex gap-3">
                <span className="numeral mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill
                                 bg-accent-soft text-[0.625rem] font-black text-accent">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{h}</span>
                  <span className="block text-ink-soft">{b}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  )
}
