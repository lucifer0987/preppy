import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPaperById, paperLock } from '../../../../lib/repo/papers'
import { QuestionCard } from '../../../../components/QuestionCard'
import { DirectionsBlock } from '../../../../components/DirectionsBlock'
import { SECTION_NAMES, type SectionCode } from '../../../../lib/types'
import { formatIstDate, istDate, windowState, addDays } from '../../../../lib/time'
import { listPaperImages } from '../../../../lib/repo/images'
import { requireAdmin } from '../../../../lib/guard'
import { scheduleAction, unscheduleAction } from './actions'
import { KeyEditor } from './KeyEditor'
import { QuestionEditor } from './QuestionEditor'
import { DeleteButton } from './DeleteButton'
import { getItemStats } from '../../../../lib/repo/rescore'
import { OPTION_LABELS, type OptionLabel, type PaperQuestion } from '../../../../lib/types'

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
  await requireAdmin()
  const { id } = await params
  const q = await searchParams
  const [record, lock] = await Promise.all([getPaperById(id), paperLock(id)])
  if (!record || !lock) notFound()

  const { paper, status } = record
  const [stats, stored] = await Promise.all([getItemStats(id), listPaperImages(id)])
  // Edge case "image fails to load": a name the paper uses with no file behind
  // it is flagged here, where it can be fixed, rather than found by a student.
  const referenced = new Map<string, number[]>()
  for (const s of paper.sections) {
    for (const d of s.directions ?? []) for (const n of d.images ?? []) referenced.set(n, [...(referenced.get(n) ?? []), d.from])
    for (const q of s.questions) for (const n of q.images ?? []) referenced.set(n, [...(referenced.get(n) ?? []), q.number])
  }
  const missingImages = stored === null ? [] : [...referenced.entries()].filter(([n]) => !stored.includes(n))
  const totalQuestions = paper.sections.reduce((n, s) => n + s.questions.length, 0)
  const totalMinutes = paper.sections.reduce((n, s) => n + (s.durationMinutes ?? 0), 0)
  // The night the schedule form offers: the paper's own, or tomorrow's if that
  // has already opened.
  const defaultDate = windowState(paper.date) === 'BEFORE_OPEN'
    ? paper.date
    : (windowState(istDate()) === 'BEFORE_OPEN' ? istDate() : addDays(istDate(), 1))
  const statByNumber = new Map(stats.map((s) => [s.number, s]))
  const flagged = stats.filter((s) => s.suspicious)
  const scheduled = status === 'SCHEDULED'
  const badge =
    !scheduled ? 'Draft'
    : lock.state === 'BEFORE_OPEN' ? 'Scheduled'
    : lock.state === 'CLOSED' ? 'Finished'
    : 'Live now'

  return (
    <>
      <Link href="/admin/papers" className="text-sm font-bold text-play-purple">&larr; Papers</Link>

      {q['error'] && (
        <p role="alert" className="mt-4 rounded-2xl bg-notanswered px-5 py-4 font-semibold text-white">
          {q['error']}
        </p>
      )}
      {q['new'] && (
        <p className="mt-4 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          {q['replaced']
            ? 'Replaced the earlier draft for this date. Read it through below, then schedule it.'
            : 'Saved as a draft. Read it through below, then schedule it.'}
        </p>
      )}
      {q['rescored'] && (
        <p className="mt-4 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          Q{q['rescored']} changed from {q['from']} to {q['to']}. {q['of']} attempt
          {q['of'] === '1' ? '' : 's'} rescored, {q['changed']} score
          {q['changed'] === '1' ? '' : 's'} moved.
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
            {formatIstDate(paper.date)} &middot; {totalQuestions} questions &middot; {totalMinutes} minutes
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white
                      ${badge === 'Draft' ? 'bg-ink-soft' : badge === 'Live now' ? 'bg-notanswered' : 'bg-answered'}`}
        >
          {badge}
        </span>
      </header>

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-5">
        {lock.canSchedule && (
          <a href="#schedule" className="rounded-2xl bg-play-purple px-6 py-3 font-black text-white transition hover:bg-play-purple-deep">
            Read it through, then schedule at the end &darr;
          </a>
        )}
        {lock.canUnschedule && (
          <form action={unscheduleAction}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-2xl border-2 border-black/15 px-6 py-3 font-bold transition hover:border-black/30">
              Move back to draft
            </button>
          </form>
        )}
        {lock.reason && (
          <p className="text-sm font-semibold text-ink-soft">{lock.reason}</p>
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
        {lock.canDelete && (
          <div className="ml-auto">
            <DeleteButton id={id} label={`the paper for ${formatIstDate(paper.date)}`} />
          </div>
        )}
      </section>

      {missingImages.length > 0 && (
        <section role="alert" className="mt-6 rounded-3xl bg-notanswered px-5 py-4 text-white">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/70">Images missing</h2>
          <p className="mt-1 text-sm">
            {missingImages.map(([n, qs]) => `${n} (Q${qs.join(', Q')})`).join('; ')}. Students would see a
            placeholder. Upload the paper again with {missingImages.length === 1 ? 'this file' : 'these files'}.
          </p>
        </section>
      )}

      {flagged.length > 0 && (
        <section className="mt-6 rounded-3xl bg-notanswered px-5 py-4 text-white">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/70">
            Worth a second look
          </h2>
          <p className="mt-1 text-sm">
            {flagged.map((f) => `Q${f.number}`).join(', ')}{' '}
            {flagged.length === 1 ? 'was' : 'were'} answered correctly by under 10% of the students
            who tried {flagged.length === 1 ? 'it' : 'them'}. That is usually a wrong key rather
            than a hard question.
          </p>
        </section>
      )}

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
                  {isFirstOfBlock && <DirectionsBlock block={block} testId={id} />}
                  <QuestionCard question={question} testId={id} reveal disabled />
                  <ItemFooter
                    testId={id}
                    question={question}
                    stat={statByNumber.get(question.number)}
                  />
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {lock.canSchedule && (
        <form id="schedule" action={scheduleAction} className="mt-10 rounded-3xl bg-white p-6">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-xl font-black">Schedule this paper</h2>
          <p className="mt-1 text-sm text-ink-soft">
            It unlocks at 10 PM on the night you choose. Until then you can move it back to draft.
          </p>
          <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-ink-soft">
            Night
            <input type="date" name="date" defaultValue={defaultDate} min={istDate()} required
                   className="mt-1 block rounded-xl border-2 border-black/15 px-3 py-2 text-base font-semibold" />
          </label>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" name="reviewed" value="yes" required className="mt-1 h-4 w-4" />
            <span>I have read all {totalQuestions} questions above, with their keys and solutions.</span>
          </label>
          <button className="mt-5 rounded-2xl bg-play-purple px-6 py-3 font-black text-white transition hover:bg-play-purple-deep">
            Schedule it
          </button>
        </form>
      )}
    </>
  )
}

function ItemFooter({
  testId, question, stat,
}: {
  testId: string
  question: PaperQuestion
  stat: { questionId: string; correctPct: number | null; attempts: number; suspicious: boolean } | undefined
}) {
  if (!stat) return null
  const present = OPTION_LABELS.filter((l) => question.options[l] !== undefined)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-black/10 pt-3">
      <span className="text-xs text-ink-soft tabular-nums">
        {stat.attempts === 0
          ? 'Not yet attempted'
          : `${stat.correctPct}% correct of ${stat.attempts} who answered`}
      </span>
      {stat.suspicious && (
        <span className="rounded-full bg-notanswered px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
          Check this key
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-4">
        <QuestionEditor
          testId={testId}
          questionId={stat.questionId}
          questionNumber={question.number}
          text={question.text}
          options={present.map((l): [OptionLabel, string] => [l, question.options[l] ?? ''])}
          solution={question.solution ?? ''}
        />
        <KeyEditor
          testId={testId}
          questionId={stat.questionId}
          questionNumber={question.number}
          current={question.answer}
          present={present}
        />
      </span>
    </div>
  )
}
