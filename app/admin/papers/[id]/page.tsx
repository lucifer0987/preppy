import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPaperById } from '../../../../lib/repo/papers'
import { QuestionCard } from '../../../../components/QuestionCard'
import { DirectionsBlock } from '../../../../components/DirectionsBlock'
import { SECTION_NAMES, TOTAL_MINUTES, TOTAL_QUESTIONS, type SectionCode } from '../../../../lib/types'
import { formatIstDate, windowState } from '../../../../lib/time'
import { deleteAction, scheduleAction, unscheduleAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The preview (FR-6.9.1).
 *
 * Every question is rendered with the same component the test engine uses, so
 * what the admin approves here is literally what a student will see. This is
 * the last line of defence against a bad paper and cannot be skipped: the
 * Schedule button lives only on this page.
 */
export default async function PaperPreview(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> },
) {
  const { id } = await params
  const q = await searchParams
  const record = await getPaperById(id)
  if (!record) notFound()

  const { paper, status } = record
  const scheduled = status === 'SCHEDULED'
  const state = windowState(paper.date)
  const alreadyRun = state === 'CLOSED'

  return (
    <>
      <Link href="/admin/papers" className="text-sm font-bold text-play-purple">&larr; Papers</Link>

      {q['new'] && (
        <p className="mt-4 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          {q['replaced']
            ? 'Replaced the earlier draft for this date. Read it through below, then schedule it.'
            : 'Saved as a draft. Read it through below, then schedule it.'}
        </p>
      )}
      {q['scheduled'] && (
        <p className="mt-4 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          Scheduled. It unlocks at 10 PM on {formatIstDate(paper.date)}.
        </p>
      )}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{paper.title ?? 'Untitled paper'}</h1>
          <p className="mt-1 text-ink-soft">
            {formatIstDate(paper.date)} &middot; {TOTAL_QUESTIONS} questions &middot; {TOTAL_MINUTES} minutes
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white
                      ${scheduled ? 'bg-answered' : 'bg-ink-soft'}`}
        >
          {scheduled ? 'Scheduled' : 'Draft'}
        </span>
      </header>

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-5">
        {!scheduled && !alreadyRun && (
          <form action={scheduleAction}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-2xl bg-play-purple px-6 py-3 font-black text-white transition hover:bg-play-purple-deep">
              Schedule for {formatIstDate(paper.date)}
            </button>
          </form>
        )}
        {scheduled && (
          <form action={unscheduleAction}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-2xl border-2 border-black/15 px-6 py-3 font-bold transition hover:border-black/30">
              Move back to draft
            </button>
          </form>
        )}
        {alreadyRun && (
          <p className="text-sm font-semibold text-ink-soft">
            This date has already passed, so it can no longer be scheduled.
          </p>
        )}
        <p className="basis-full text-xs text-ink-soft">
          A dry run uses the real engine and the real timers. It is never counted and never
          reaches the leaderboard (FR-5.2).
        </p>
        <Link
          href={`/test/start?test=${id}`}
          className="rounded-2xl border-2 border-play-green px-6 py-3 font-bold text-play-green transition hover:bg-play-green/10"
        >
          Dry run
        </Link>
        <form action={deleteAction} className="ml-auto">
          <input type="hidden" name="id" value={id} />
          <button className="text-sm font-bold text-notanswered underline">Delete this paper</button>
        </form>
      </section>

      <p className="mt-8 text-xs font-bold uppercase tracking-widest text-ink-soft">
        Preview &middot; exactly what a student sees
      </p>

      {paper.sections.map((section) => (
        <section key={section.code} className="mt-6">
          <h2 className="sticky top-0 z-10 -mx-2 bg-paper/95 px-2 py-2 text-lg font-black backdrop-blur">
            {SECTION_NAMES[section.code as SectionCode]}
            <span className="ml-2 text-sm font-semibold text-ink-soft">
              {section.questions.length} q &middot; {section.durationMinutes} min
            </span>
          </h2>

          <ol className="mt-3 space-y-4">
            {section.questions.map((question) => {
              const block = section.directions?.find((b) => question.number >= b.from && question.number <= b.to)
              const isFirstOfBlock = block && question.number === block.from
              return (
                <li key={question.number} className="rounded-3xl bg-white p-5">
                  {isFirstOfBlock && <DirectionsBlock block={block} />}
                  <QuestionCard question={question} reveal disabled />
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </>
  )
}
