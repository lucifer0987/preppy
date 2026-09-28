import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPaperById, paperLock } from '../../../../lib/repo/papers'
import { QuestionCard } from '../../../../components/QuestionCard'
import { SectionShape } from '../../../../components/SectionShape'
import { DirectionsBlock } from '../../../../components/DirectionsBlock'
import { sectionName, type SectionCode } from '../../../../lib/types'
import { patternForPaper } from '../../../../lib/repo/tracks'
import {
  addDays, defaultPaperWindow, formatIstDate, istDate, paperLabels, windowState,
} from '../../../../lib/time'
import { getWindow } from '../../../../lib/repo/settings'
import { listPaperImages } from '../../../../lib/repo/images'
import { requireAdmin } from '../../../../lib/guard'
import { scheduleAction, unscheduleAction } from './actions'
import { KeyEditor } from './KeyEditor'
import { QuestionEditor } from './QuestionEditor'
import { DeleteButton } from './DeleteButton'
import { getItemStats } from '../../../../lib/repo/rescore'
import { BackLink, PageHeader, StatusChip } from '../../../../components/Page'
import { TimeField } from '../../../../components/TimeField'
import { DateField } from '../../../../components/DateField'
import { OPTION_LABELS, type OptionLabel, type PaperQuestion } from '../../../../lib/types'
import { Flash } from '../../../../components/Page'

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
  const [record, lock, pattern] = await Promise.all([
    getPaperById(id), paperLock(id), patternForPaper(id),
  ])
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
  const defaults = await getWindow()
  // The window the schedule form offers: the paper's own if it has one and has
  // not opened, otherwise the usual times on the first day they still would.
  const offered = record.window
  const usual = defaultPaperWindow(paper.date, defaults)
  const defaultWindow = windowState(offered) === 'BEFORE_OPEN'
    ? offered
    : windowState(usual) === 'BEFORE_OPEN'
      ? usual
      : defaultPaperWindow(addDays(istDate(), 1), defaults)
  const defaultDate = defaultWindow.date
  const statByNumber = new Map(stats.map((s) => [s.number, s]))
  const flagged = stats.filter((s) => s.suspicious)
  const scheduled = status === 'SCHEDULED'
  const badge =
    !scheduled ? 'Draft'
    : lock.window.endedAt ? 'Ended early'
    : lock.state === 'BEFORE_OPEN' ? 'Scheduled'
    : lock.state === 'CLOSED' ? 'Finished'
    : 'Live now'
  const badgeTone =
    badge === 'Draft' ? 'draft' as const
    : badge === 'Scheduled' ? 'waiting' as const
    : badge === 'Finished' || badge === 'Ended early' ? 'done' as const
    : 'live' as const

  return (
    <>
      <BackLink href="/admin/papers">Papers</BackLink>

      {q['error'] && (
        <Flash tone="bad" className="mt-4 mb-5">
          {q['error']}
        </Flash>
      )}
      {q['new'] && (
        <Flash tone="good" className="mt-4 mb-5">
          {q['replaced']
            ? 'Replaced the earlier draft for this date. Read it through below, then schedule it.'
            : 'Saved as a draft. Read it through below, then schedule it.'}
        </Flash>
      )}
      {q['rescored'] && (
        <Flash tone="good" className="mt-4 mb-5">
          Q{q['rescored']} changed from {q['from']} to {q['to']}. {q['of']} attempt
          {q['of'] === '1' ? '' : 's'} rescored, {q['changed']} score
          {q['changed'] === '1' ? '' : 's'} moved.
        </Flash>
      )}
      {q['replaced'] && (
        <Flash tone="good" className="mt-4 mb-5">
          The questions were replaced. The paper keeps the day and the window it already had.
          Read it through again below.
        </Flash>
      )}
      {q['scheduled'] && (
        <Flash tone="good" className="mt-4 mb-5">
          Scheduled. It unlocks at {paperLabels(record.window).opens} on {formatIstDate(paper.date)}.
        </Flash>
      )}

      <PageHeader compact
        title={paper.title ?? 'Untitled paper'}
        meta={
          <>
            <span className="numeral">{formatIstDate(paper.date)}</span> &middot;{' '}
            <span className="numeral">{totalQuestions}</span> questions &middot;{' '}
            <span className="numeral">{totalMinutes}</span> minutes
            {scheduled && (
              <span className="mt-1 block font-semibold">
                Opens <span className="numeral">{paperLabels(record.window).opens}</span> &middot; last
                start <span className="numeral">{paperLabels(record.window).closes}</span> &middot;
                everyone finished by <span className="numeral">{paperLabels(record.window).hardStop}</span>
              </span>
            )}
          </>
        }
        actions={
          <>
            <StatusChip tone={badgeTone}>{badge}</StatusChip>
            {scheduled && (
              <Link href={`/admin/papers/${id}/manage`} className="btn btn-quiet px-4 py-2 text-sm">
                Manage
              </Link>
            )}
          </>
        }
      />

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {lock.canSchedule && (
            <a href="#schedule" className="btn btn-primary">
              Schedule this paper &darr;
            </a>
          )}
          {lock.canUnschedule && (
            <form action={unscheduleAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn btn-quiet">Move back to draft</button>
            </form>
          )}
          {/* Deliberately not btn-quiet: that utility now owns its own hover
              colours, and they would fight the green this button keeps. */}
          <Link
            href={`/test/start?test=${id}`}
            className="btn btn-quiet"
          >
            Dry run
          </Link>
          {scheduled ? (
            <div className="ml-auto">
              <Link href={`/admin/papers/${id}/manage`} className="btn btn-quiet">
                Manage this paper
              </Link>
            </div>
          ) : lock.canDelete ? (
            <div className="ml-auto">
              <DeleteButton id={id} label={`the paper for ${formatIstDate(paper.date)}`} />
            </div>
          ) : null}
        </div>
        {lock.reason && (
          <p className="mt-3 text-sm font-semibold text-ink-soft">{lock.reason}</p>
        )}
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
          A dry run uses the real engine and the real timers. It is never counted and never
          reaches the leaderboard (FR-5.2).
        </p>
      </section>

      {missingImages.length > 0 && (
        <section role="alert" className="mt-6 rounded-card border border-bad/35 bg-bad/10 p-5">
          <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bad-ink">
            Images missing
          </h2>
          <p className="mt-1.5 text-sm text-ink">
            {missingImages.map(([n, qs]) => `${n} (Q${qs.join(', Q')})`).join('; ')}. Students would see a
            placeholder. Upload the paper again with {missingImages.length === 1 ? 'this file' : 'these files'}.
          </p>
        </section>
      )}

      {flagged.length > 0 && (
        <section className="mt-6 rounded-card border border-warn/35 bg-warn/10 p-5">
          <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-warn-ink">
            Worth a second look
          </h2>
          <p className="mt-1.5 text-sm text-ink">
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

      {paper.sections.map((section, i) => (
        <section key={section.code} className="mt-6">
          <h2 className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-x-3 gap-y-1
                         bg-page/95 px-2 py-2 text-lg font-black backdrop-blur">
            <SectionShape index={i} />
            {sectionName(pattern, section.code as SectionCode)}
            <span className="numeral text-sm font-semibold text-ink-soft">
              {section.questions.length} questions &middot; {section.durationMinutes} min
            </span>
          </h2>

          <ol className="mt-3 space-y-4">
            {section.questions.map((question) => {
              const block = section.directions?.find((b) => question.number >= b.from && question.number <= b.to)
              const isFirstOfBlock = block && question.number === block.from
              return (
                <li key={question.number} className="card p-5">
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
        <form id="schedule" action={scheduleAction} className="mt-10 card p-6">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-xl font-black">Schedule this paper</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick the day and the window below. Until it opens you can still move it back to draft.
          </p>
          {/* The date input keeps the platform calendar -- picking a day from a grid
               is the one thing it does better than anything hand-built -- but it now
               sits in the app's own field, and accent-color points its selection at
               the brand instead of the system blue. */}
          <div className="mt-4">
            <DateField name="date" label="Day" defaultValue={defaultDate} min={istDate()} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TimeField name="opensAt" label="Unlocks at"
                       defaultValue={hhmm(defaultWindow.opensAtMin)} />
            <TimeField name="entryClosesAt" label="Last moment to start"
                       defaultValue={hhmm(defaultWindow.entryClosesAtMin)} max="23:15" />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Anyone starting before the second time still gets the full {totalMinutes} minutes, so the
            paper finishes {paperLabels(defaultWindow).hardStop === 'midnight' ? 'by midnight' : `by ${paperLabels(defaultWindow).hardStop}`}.
            More than one paper can run in a day, and they may share a window. A student sits one at a time and picks the order; two on one night need different names.
          </p>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" name="reviewed" value="yes" required className="mt-1 h-4 w-4" />
            <span>I have read all {totalQuestions} questions above, with their keys and solutions.</span>
          </label>
          <button className="btn btn-primary mt-5">
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
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3">
      <span className="text-xs text-ink-soft tabular-nums">
        {stat.attempts === 0
          ? 'Not yet attempted'
          : `${stat.correctPct}% correct of ${stat.attempts} who answered`}
      </span>
      {stat.suspicious && (
        <StatusChip tone="bad">Check this key</StatusChip>
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

/** Minutes from midnight as "HH:MM", for a time input. */
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
