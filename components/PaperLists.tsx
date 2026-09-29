import Link from 'next/link'
import { StatusChip } from './Page'
import { formatIstDate, paperLabels, type PaperWindow } from '../lib/time'

type Paper = {
  id: string; title: string | null; window: PaperWindow
  shape: { questions: number; minutes: number }
}

/** Name, day, and what sitting it involves. The same line on both lists. */
function PaperName({ paper }: { paper: Paper }) {
  return (
    /* basis-full under sm, so the name gets the row to itself and whatever
       follows wraps beneath it. Sharing the line on a phone truncated the
       title to "Week ..." beside a button, which is the one thing on the row
       that has to be readable. */
    <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
      <span className="block truncate font-bold text-ink">{paper.title ?? 'Daily mock'}</span>
      <span className="numeral mt-0.5 block text-xs text-ink-faint">
        {formatIstDate(paper.window.date)} &middot; {paper.shape.questions} questions
        &middot; {paper.shape.minutes} minutes
      </span>
    </span>
  )
}

/**
 * Papers that have not opened yet.
 *
 * No action on any of them, which is the point: this is the part of the page
 * that exists so "all papers" is true. A student checking whether there is
 * something tonight should not have to work it out from the dashboard's
 * countdown.
 */
export function UpcomingPaperList({ papers }: { papers: readonly Paper[] }) {
  return (
    <section className="mt-6" aria-labelledby="opening-later">
      <h2 id="opening-later" className="eyebrow">Opening later</h2>
      <ul className="mt-2.5 space-y-2">
        {papers.map((paper) => (
          <li key={paper.id}
              className="card-flat flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
            <PaperName paper={paper} />
            <StatusChip tone="draft">Unlocks at {paperLabels(paper.window).opens}</StatusChip>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The papers a student can sit right now, on the page that lists all of them.
 *
 * Two lists live in this file because they are two halves of one idea -- what
 * is open, and what is coming -- and they share the row's name block, so the
 * page cannot describe the same paper two ways.
 *
 * The list of papers used to be a list of finished ones, so a student who came
 * looking for tonight's paper found last night's. The one they could actually
 * sit lived on the dashboard and nowhere else.
 *
 * Only papers they have not handed in reach here. A finished one is already
 * further down the page with its score and its rank, and showing it twice --
 * once as something to do and once as something done -- would be worse than
 * either.
 *
 * What may be pressed is decided by `viewerStateFor`, the same function the
 * dashboard asks, so the two screens cannot disagree about whether a paper can
 * be started.
 */
export function OpenPaperList({ rows }: {
  rows: readonly {
    paper: { id: string; title: string | null; window: PaperWindow
             shape: { questions: number; minutes: number } }
    attemptId: string | null
    running: boolean
    canStart: boolean
  }[]
}) {
  return (
    <section className="mt-6" aria-labelledby="open-now">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="open-now" className="eyebrow">Open now</h2>
        {rows.length > 1 && (
          <span className="text-sm text-ink-faint">
            {rows.length} papers, and you may sit them in any order
          </span>
        )}
      </div>
      <ul className="mt-2.5 space-y-2">
        {rows.map(({ paper, attemptId, running, canStart }) => {
          const labels = paperLabels(paper.window)
          return (
            <li key={paper.id}
                className="card flex flex-wrap items-center gap-x-4 gap-y-3 border-accent/40 p-4">
              <PaperName paper={paper} />

              <span className="flex flex-wrap items-center gap-2.5">
                <StatusChip tone={running ? 'live' : canStart ? 'waiting' : 'done'}>
                  {running ? 'In progress' : canStart ? `Entry until ${labels.closes}` : 'Entry closed'}
                </StatusChip>
              </span>

              <span className="flex flex-wrap items-center gap-2">
                {running && attemptId && (
                  <Link href={`/test/${attemptId}`} className="btn btn-zap px-4 py-2 text-sm">
                    Resume
                  </Link>
                )}
                {canStart && (
                  <Link href={`/test/start?test=${paper.id}`}
                        className="btn btn-primary px-4 py-2 text-sm">
                    Start
                  </Link>
                )}
                {/* Neither: entry closed without them. The paper is
                    still running for whoever is in it, so there is
                    nothing here to press -- and its answers are not
                    theirs to read until it closes. */}
                {!running && !canStart && (
                  <span className="text-xs text-ink-faint">Too late to start</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
