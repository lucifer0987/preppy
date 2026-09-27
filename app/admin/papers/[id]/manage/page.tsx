import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '../../../../../lib/guard'
import { getPaperById, paperLock } from '../../../../../lib/repo/papers'
import { countRunningAttempts } from '../../../../../lib/repo/attempt-admin'
import { formatIstDate, formatIstMoment, paperLabels } from '../../../../../lib/time'
import { SECTION_NAMES, type SectionCode } from '../../../../../lib/types'
import { BackLink, Flash, PageHeader, StatusChip, Th } from '../../../../../components/Page'
import { SectionShape } from '../../../../../components/SectionShape'
import { TimeField } from '../../../../../components/TimeField'
import { endNowAction, retimeAction, setMarksAction } from '../actions'
import { EndNowButton } from './EndNowButton'
import { DeleteButton } from '../DeleteButton'

export const dynamic = 'force-dynamic'

/**
 * Everything an admin can do to a paper that is already out.
 *
 * It is a screen of its own rather than a band on the preview, because the
 * preview is for reading the paper and this is for changing the terms it runs
 * on. Each control says what it does to the people sitting it, in figures
 * where there are figures: a paper with twelve minutes left and two students
 * in it is not a row in a table, and the screen should not pretend it is.
 */
export default async function ManagePaper({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  await requireAdmin()
  const { id } = await params
  const q = await searchParams
  const [record, lock] = await Promise.all([getPaperById(id), paperLock(id)])
  if (!record || !lock) notFound()

  const { paper } = record
  const running = await countRunningAttempts(id)
  const l = paperLabels(lock.window)
  const ended = lock.window.endedAt
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const marks = paper.sections.map((s) => ({
    code: s.code as SectionCode,
    correct: s.marksCorrect ?? 1,
    negative: s.marksNegative ?? 0,
  }))
  const state =
    lock.status === 'DRAFT' ? 'Draft'
    : ended ? 'Ended early'
    : lock.state === 'BEFORE_OPEN' ? 'Scheduled'
    : lock.state === 'CLOSED' ? 'Finished'
    : lock.state === 'ENTRY_CLOSED' ? 'Finishing'
    : 'Live now'

  return (
    <>
      <BackLink href={`/admin/papers/${id}`}>Back to the paper</BackLink>

      <PageHeader
        compact
        title="Manage this paper"
        meta={
          <span className="numeral">
            {paper.title ?? 'Untitled'} &middot; {formatIstDate(lock.date)}
          </span>
        }
        actions={<StatusChip tone={state === 'Live now' ? 'live' : state === 'Finished' || state === 'Ended early' ? 'done' : state === 'Draft' ? 'draft' : 'waiting'}>{state}</StatusChip>}
      />

      {q['error'] && <Flash tone="bad" className="mt-4">{q['error']}</Flash>}
      {q['done'] === 'retimed' && (
        <Flash tone="good" className="mt-4">
          Window moved. It now runs {l.opens} to {l.closes}, and everyone is finished by {l.hardStop}.
        </Flash>
      )}
      {q['done'] === 'ended' && (
        <Flash tone="good" className="mt-4">
          Ended. {q['closed'] === '0'
            ? 'Nobody was still sitting it.'
            : `${q['closed']} attempt${q['closed'] === '1' ? ' was' : 's were'} submitted and scored where they stood.`}{' '}
          Answers are open and the leaderboard has taken it in.
        </Flash>
      )}
      {q['done'] === 'marks' && (
        <Flash tone="good" className="mt-4">
          Marking saved. {q['of'] === '0'
            ? 'No attempt needed scoring again.'
            : `${q['of']} attempt${q['of'] === '1' ? '' : 's'} scored again, ${q['moved']} score${q['moved'] === '1' ? '' : 's'} moved.`}
        </Flash>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        <Fact label="State" value={state} />
        <Fact label="Sat by" value={`${lock.realAttempts}`} />
        <Fact label="Sitting it now" value={`${running}`} tone={running > 0 ? 'live' : 'plain'} />
        <Fact label={ended ? 'Ended' : 'Everyone finished by'}
              value={ended ? formatIstMoment(ended) : l.hardStop} />
      </dl>

      {/* ------------------------------------------------------ the window */}
      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="text-lg font-black">The window</h2>
        <p className="measure-wide mt-1 text-sm text-ink-soft">
          {lock.canRetime
            ? lock.state === 'BEFORE_OPEN'
              ? 'It has not opened yet, so both times can still move.'
              : 'It is already open, so the opening time is fixed. Moving the last moment to start also moves the finish, because whoever starts last still gets the whole paper.'
            : ended
              ? 'This paper was ended early, so its times no longer decide anything.'
              : 'This paper has finished. Its window can no longer be moved.'}
        </p>

        {lock.canRetime ? (
          <form action={retimeAction} className="mt-5">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-5 sm:grid-cols-2">
              {lock.state === 'BEFORE_OPEN' ? (
                <TimeField name="opensAt" label="Unlocks at" defaultValue={hhmm(lock.window.opensAtMin)} />
              ) : (
                <div>
                  <span className="eyebrow">Unlocked at</span>
                  <p className="numeral mt-1.5 py-2 text-lg font-bold">{l.opens}</p>
                </div>
              )}
              <TimeField
                name="entryClosesAt"
                label="Last moment to start"
                defaultValue={hhmm(lock.window.entryClosesAtMin)}
                max={hhmm(24 * 60 - lock.window.attemptMinutes)}
                hint={`Whoever starts then still gets the full ${lock.window.attemptMinutes} minutes.`}
              />
            </div>
            <button className="btn btn-primary mt-5 px-6">Save the window</button>
          </form>
        ) : null}
      </section>

      {/* -------------------------------------------------- ending it early */}
      {lock.canEndNow && (
        <section className="card mt-4 border-warn/40 p-5 sm:p-6">
          <h2 className="text-lg font-black">End it now, for everyone</h2>
          <p className="measure-wide mt-1 text-sm text-ink-soft">
            Whatever the times say. Nobody else can start it
            {running === 0
              ? ' and nobody is in it right now'
              : `, and the ${running} attempt${running === 1 ? '' : 's'} still running ${running === 1 ? 'is' : 'are'} submitted and scored exactly where ${running === 1 ? 'it stands' : 'they stand'}`}.
            Answers, the archive and the leaderboard open the moment you press it.
          </p>
          <div className="mt-5">
            <EndNowButton id={id} running={running} action={endNowAction} />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- the marking */}
      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="text-lg font-black">What the questions are worth</h2>
        <p className="measure-wide mt-1 text-sm text-ink-soft">
          Per section, for this paper only. Changing it scores every finished attempt again, so the
          board and the results never disagree with the marking they came from.
        </p>
        <form action={setMarksAction} className="mt-5">
          <input type="hidden" name="id" value={id} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <thead>
                {/* Th, not the eyebrow utility: that one is display:block, which
                    takes a table header cell out of its row. */}
                <tr className="border-b border-line">
                  <Th className="pl-0">Section</Th>
                  <Th>A right answer</Th>
                  <Th>A wrong one costs</Th>
                </tr>
              </thead>
              <tbody>
                {marks.map((m, i) => (
                  <tr key={m.code} className="border-t border-line">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2.5">
                        <SectionShape index={i} />
                        <span className="font-semibold">{SECTION_NAMES[m.code]}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <input type="number" name={`${m.code}.correct`} defaultValue={m.correct}
                             step="0.25" min="0.25" max="10" required
                             aria-label={`${SECTION_NAMES[m.code]}, marks for a right answer`}
                             className="field w-24 tabular-nums" />
                    </td>
                    <td className="py-2.5">
                      <input type="number" name={`${m.code}.wrong`} defaultValue={m.negative}
                             step="0.25" min="0" max="10" required
                             aria-label={`${SECTION_NAMES[m.code]}, marks a wrong answer costs`}
                             className="field w-24 tabular-nums" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary mt-5 px-6">
            {lock.realAttempts > 0 ? 'Save and score again' : 'Save the marking'}
          </button>
        </form>
      </section>

      {/* ------------------------------------------- replacing the questions */}
      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="text-lg font-black">The questions themselves</h2>
        <p className="measure-wide mt-1 text-sm text-ink-soft">
          A single wrong key is corrected on the paper itself, question by question, and rescores
          everyone on the spot. This is for the other case: the file was wrong, and the whole thing
          needs to go back in.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={`/admin/papers/${id}`} className="btn btn-quiet px-5 py-2.5">
            Correct it question by question
          </Link>
          {lock.canReplace ? (
            <Link href={`/admin/papers/upload?replace=${id}`} className="btn btn-primary px-5 py-2.5">
              Upload a corrected file
            </Link>
          ) : (
            <p className="text-sm text-ink-soft">
              {lock.realAttempts} student{lock.realAttempts === 1 ? ' has' : 's have'} sat it, so the
              questions cannot be swapped underneath them.
            </p>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- removing it */}
      <section className="card mt-4 border-bad/30 p-5 sm:p-6">
        <h2 className="text-lg font-black">Remove it</h2>
        <p className="measure-wide mt-1 text-sm text-ink-soft">
          {lock.realAttempts === 0
            ? 'Nobody has sat this paper, so nothing but the paper itself goes. Upload the corrected one afterwards as a new paper.'
            : `This paper has been sat ${lock.realAttempts} time${lock.realAttempts === 1 ? '' : 's'}. Deleting it takes those attempts, their answers and their scores with it, and takes them off the leaderboard for good.`}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <DeleteButton
            id={id}
            force={lock.realAttempts > 0}
            label={lock.realAttempts > 0
              ? `${formatIstDate(lock.date)}, and the ${lock.realAttempts} attempt${lock.realAttempts === 1 ? '' : 's'} on it`
              : `the paper for ${formatIstDate(lock.date)}`}
          />
          {lock.canUnschedule && (
            <p className="text-sm text-ink-soft">
              Or move it back to draft from the paper screen, which keeps it and hides it.
            </p>
          )}
        </div>
      </section>
    </>
  )
}

function Fact({ label, value, tone = 'plain' }: {
  label: string; value: string; tone?: 'plain' | 'live'
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={`numeral mt-0.5 text-lg font-bold ${tone === 'live' ? 'text-bad-ink' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
