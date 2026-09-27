import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '../../../../lib/guard'
import { db } from '../../../../lib/supabase/admin'
import { sectionName, type SectionCode } from '../../../../lib/types'
import { patternForPaper } from '../../../../lib/repo/tracks'
import {
  pacingVerdict, scoreBounds, sectionTimeUsed, slowestQuestions, type SectionScore,
} from '../../../../lib/scoring'
import { ordinal } from '../../../../lib/leaderboard'
import { getPaperById } from '../../../../lib/repo/papers'
import {
  getPaperStandings, getResultStanding, type ResultStanding,
} from '../../../../lib/repo/leaderboard'
import { formatIstDate, paperClosed, paperLabels } from '../../../../lib/time'
import { paperWindowOf } from '../../../../lib/repo/papers'
import { Celebration, type CelebrationLevel } from '../../../../components/Celebration'
import { CountUp } from '../../../../components/CountUp'
import { ResultSound } from '../../../../components/ResultSound'
import { SoundToggle } from '../../../../components/SoundToggle'
import { ThemeToggle } from '../../../../components/ThemeToggle'
import { Flash, TableShell, Th } from '../../../../components/Page'
import { SectionShape } from '../../../../components/SectionShape'

export const dynamic = 'force-dynamic'

/**
 * The result (PRD section 6.6).
 *
 * Until the paper closes, everything here is about this student and nobody
 * else (FR-5.3): the score and its breakdown are shown the moment they submit,
 * and every cohort-derived figure -- the two ranks, the best score, the
 * average -- waits for the paper's own hard stop, so nobody can read off this
 * page who has already sat the paper. Once it has closed, the board
 * shows the cohort their scores anyway, and a result you cannot place against
 * anything is half a result. Answers unlock at the same moment (FR-4.3).
 *
 * The paper itself is loaded for its shape (bounds, section bands) only.
 * Nothing from it beyond numbers reaches the page, and nothing reaches a
 * client component, so no key leaves the server before midnight (FR-13.1).
 */
export default async function DonePage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  // A student deactivated mid-test may still see the result of it (PRD §11).
  const user = await requireUser({ allowInactive: true })

  const client = db()
  // rescored_at on the attempt is set only when a rescore moved this attempt's
  // result, so only affected students see the notice (FR-6.9.3).
  const { data: attempt } = await client
    .from('attempts')
    .select('id, user_id, test_id, state, is_dry_run, total_score, section_scores, attempted, correct, wrong, skipped, not_reached, time_spent_sec, fullscreen_exits, tab_switches, rescored_at, tests(date, title, status, track_id, opens_at_min, entry_closes_at_min, attempt_sec, ended_at)')
    .eq('id', attemptId)
    .maybeSingle()

  if (!attempt || attempt.user_id !== user.id) redirect('/dashboard')
  if (attempt.state === 'IN_PROGRESS') redirect(`/test/${attemptId}`)

  const test = attempt.tests as unknown as Record<string, unknown> & { date: string; title: string | null; status: string }
  const paperWindow = paperWindowOf(test)
  const testId = attempt.test_id as string
  const pattern = await patternForPaper(testId)
  const sections = (attempt.section_scores ?? []) as SectionScore[]
  const score = Number(attempt.total_score ?? 0)
  const minutes = Math.round((attempt.time_spent_sec ?? 0) / 60)
  // A voided attempt is shown but is not ranked, and neither is a dry run.
  const counted = !attempt.is_dry_run && attempt.state !== 'VOIDED'
  // The same row an admin's rehearsal leaves behind, asked for on purpose by
  // a student re-sitting a paper already open to them (PRD 6.11).
  const practice = Boolean(attempt.is_dry_run) && user.role === 'student'
  // Yours the moment you hand it in: the answers are shut only to somebody who
  // can still sit the paper, and that is no longer this student.
  const unlocked = counted || paperClosed(paperWindow)
  const ranked = counted
  // Entry is over, so nothing on this page can move again. Until then every
  // rank here is a standing among those who have finished so far, and says so.
  const settled = paperClosed(paperWindow)

  const [record, sectionRows, responseRows, earlier, standing, standings] = await Promise.all([
    getPaperById(testId),
    client.from('attempt_sections')
      .select('started_at, ended_at, sections(code, duration_sec)')
      .eq('attempt_id', attemptId),
    client.from('responses')
      .select('time_spent_sec, questions(number)')
      .eq('attempt_id', attemptId),
    // A personal best is measured against papers that came before this one.
    // Comparing against later papers too would make revisiting an old result
    // deny it the best it was at the time.
    counted
      ? client.from('attempts').select('total_score, tests!inner(date)')
          .eq('user_id', user.id).eq('is_dry_run', false)
          .in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])
          .lt('tests.date', test.date)
      : Promise.resolve({ data: [] as { total_score: number | null }[] }),
    // The rank is a bonus on this page; a failed read must never hide the score.
    ranked
      ? getResultStanding(user.id, paperWindow, test.track_id as string).catch((e: Error) => {
          console.error('[result] could not compute standing', e.message)
          return null
        })
      : Promise.resolve<ResultStanding | null>(null),
    // What everyone else scored on this paper. Reduced to two figures -- the
    // best and the average -- so no name leaves this query, and only read for
    // somebody who has finished the paper and so cannot use it.
    ranked
      ? getPaperStandings(testId, user.id).catch((e: Error) => {
          console.error('[result] could not compare', e.message)
          return null
        })
      : Promise.resolve<Awaited<ReturnType<typeof getPaperStandings>>>(null),
  ])

  const bounds = record ? scoreBounds(record.paper) : null

  const timeByCode = new Map<string, number | null>()
  for (const r of sectionRows.data ?? []) {
    const sec = r.sections as unknown as { code: string; duration_sec: number }
    timeByCode.set(sec.code, sectionTimeUsed(
      r.started_at ? new Date(r.started_at as string) : null,
      r.ended_at ? new Date(r.ended_at as string) : null,
      sec.duration_sec,
    ))
  }

  const slowest = record
    ? slowestQuestions(record.paper, (responseRows.data ?? []).map((r) => ({
        questionNumber: (r.questions as unknown as { number: number }).number,
        timeSpentSec: (r.time_spent_sec as number) ?? 0,
      })))
    : []

  // Every counted result is celebrated (PRD 6.6: "full Kahoot celebration"),
  // a personal best more loudly. A dry run is not an achievement.
  const previous = earlier.data ?? []
  const best = previous.reduce((a, r) => Math.max(a, Number(r.total_score ?? 0)), -Infinity)
  const isPersonalBest = counted && previous.length > 0 && score > best

  // Reduced to figures before it reaches the page: the best on the paper and
  // what the room averaged, never who scored what.
  //
  // This student's own attempt is folded in rather than trusted to be in the
  // list. It is the one row on this page that cannot be wrong -- it is the
  // attempt being rendered -- and a summary of the room that leaves out the
  // person reading it can contradict the score printed above it. A band that
  // said "you 4.00, best on this paper -1.75" is the bug this prevents,
  // whatever made the list come back short.
  const cohortScores = standings
    ? standings.rows.some((r) => r.userId === user.id)
      ? standings.rows.map((r) => r.score)
      : [...standings.rows.map((r) => r.score), score]
    : null
  const cohort = cohortScores && cohortScores.length > 0
    ? {
        of: cohortScores.length,
        best: Math.max(...cohortScores),
        average: cohortScores.reduce((n, v) => n + v, 0) / cohortScores.length,
      }
    : null

  const attempted = (attempt.attempted as number | null) ?? 0
  const accuracyPct = attempted === 0 ? null : ((attempt.correct as number) / attempted) * 100

  const hasPacing = sections.some((s) => pacingVerdict(s))
  const hasSlowest = slowest.some((s) => s.questions.length)

  // Finishing in the top three is its own occasion, and until ranks arrived
  // the moment you handed in there was no way to know it in time to celebrate
  // it -- so this level existed and never fired. Three finishers is the floor:
  // "1st of 2" is not a podium.
  const onPodium = Boolean(standing?.paper && standing.paper.rank <= 3 && standing.paper.of >= 3)

  const celebration: CelebrationLevel =
    !counted ? 'none'
    : isPersonalBest ? 'personal-best'
    : onPodium ? 'podium'
    : 'good'

  return (
    <main className="shell py-8">
      {/* Keyed on the attempt, so the moment fires once, not on every revisit. */}
      <Celebration level={celebration} onceKey={`result.${attemptId}`} />
      <ResultSound
        tune={!user.soundEnabled || celebration === 'none'
          ? null
          : celebration === 'good' ? 'result' : 'personal-best'}
        onceKey={`result.${attemptId}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The page's only h1. Six h2 sections followed it with nothing above
            them, so navigating this page by heading never said which paper it
            was. It keeps the eyebrow's look; only the element changes. */}
        <h1 className="eyebrow">
          {test.title ?? 'Daily mock'} &middot; {formatIstDate(test.date)}
        </h1>
        <span className="flex items-center gap-1">
          <SoundToggle initial={user.soundEnabled} compact />
          <ThemeToggle />
        </span>
      </div>

      {attempt.rescored_at && counted && (
        <Flash tone="warn" className="mt-4 text-sm">
          An answer key on this paper was corrected after it ran, and your score changed as a
          result. The score below is the corrected one.
        </Flash>
      )}

      {/* Nine stacked cards down a 1900px page was one line of content per
          screenful. The score leads, the things you read once sit beside it,
          and the section table gets the full width because it has nine
          columns and actually wants them. */}
      {/* One band of headline figures, then the comparison, then a row per
          section: the shape a result screen wants, because it is the order the
          questions come in -- what did I get, where does that put me, and
          which section did it come from. */}
      <section className="relative mt-4 overflow-hidden rounded-card bg-surface-invert p-6 text-white
                          shadow-high sm:p-8">
        <div aria-hidden="true"
             className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />

        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <div>
            {attempt.is_dry_run && (
              <p className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[10px]
                            font-bold uppercase tracking-widest">
                {practice ? 'Practice' : 'Dry run'} &middot; not counted
              </p>
            )}
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-white/60">
              Your score
            </p>
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className="numeral text-6xl font-black leading-none sm:text-7xl">
                <CountUp value={score} />
              </span>
              {bounds && <span className="numeral text-lg font-bold text-white/55">/ {bounds.max}</span>}
            </p>
            {bounds && (
              <div className="mt-4 h-2 w-full overflow-hidden rounded-pill bg-white/15">
                <div className="h-full rounded-pill bg-white/90"
                     style={{ width: `${Math.max(0, Math.min(100, (score / bounds.max) * 100)).toFixed(1)}%` }} />
              </div>
            )}
            {isPersonalBest && (
              <p className="chip mt-4 gap-1.5 bg-zap-solid px-4 py-1.5 text-sm text-white shadow-high">
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                  <path d="M8 0.8l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.6l-4.2 2.2.8-4.7L1.2 5.8l4.7-.7z" />
                </svg>
                Personal best
              </p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-white/15
                         bg-white/10 sm:grid-cols-3">
            <Tally
              label="Rank on this paper"
              value={standing?.paper ? ordinal(standing.paper.rank) : '—'}
              hint={standing?.paper
                // A percentile beside the rank once the cohort is big enough
                // to have one, because it is the figure the exam itself
                // reports back and the one a student will compare against.
                ? `of ${standing.paper.of}${settled ? '' : ' so far'}`
                  + (standing.paper.percentile === null
                    ? ''
                    : ` \u00b7 ${standing.paper.percentile.toFixed(1)} percentile`)
                : ranked ? undefined : 'not counted'}
            />
            <Tally
              label="Accuracy"
              value={accuracyPct === null ? '—' : `${accuracyPct.toFixed(0)}%`}
              // "2 of 17 attempted" read as "2 attempted, out of 17", which
              // contradicts the Right and Wrong cells beside it. The figures
              // were always right; the sentence was not.
              hint={attempted === 0 ? 'nothing attempted' : `${attempt.correct} right of ${attempted} attempted`}
            />
            <Tally label="Time used" value={`${minutes}`} hint="minutes" />
            <Tally label="Right" value={attempt.correct as number} />
            <Tally label="Wrong" value={attempt.wrong as number} />
            <Tally
              label="Unanswered"
              value={(attempt.skipped as number) + (attempt.not_reached as number)}
              hint={`${attempt.not_reached} never reached`}
            />
          </dl>
        </div>

        {counted && !settled && (
          <p className="relative mt-5 border-t border-white/15 pt-4 text-sm font-semibold text-white/80">
            Counted among everybody who has finished so far. Entry is open until{' '}
            <span className="numeral">{paperLabels(paperWindow).closes}</span>, so these can still
            move as the rest of the cohort hands in.
          </p>
        )}
      </section>

      {/* Two figures, never a name -- and only to somebody who has finished
          the paper, so it can tell them nothing they could have used. */}
      {cohort && (
        <section className="card mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="eyebrow">Where this sits</h2>
            <p className="numeral text-xs text-ink-faint">
              {cohort.of} {cohort.of === 1 ? 'has' : 'have'} finished{settled ? '' : ' so far'}
            </p>
          </div>
          <div className="mt-4 space-y-3.5">
            {([
              ['You', score, 'you'],
              ['Best on this paper', cohort.best, 'best'],
              ['What the room averaged', cohort.average, 'average'],
            ] as const).map(([label, value, kind]) => {
              const ceiling = Math.max(bounds?.max ?? 0, cohort.best, score, 1)
              const pct = Math.max(0, Math.min(100, (value / ceiling) * 100))
              return (
                <div key={kind}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={kind === 'you' ? 'font-bold text-ink' : 'text-ink-soft'}>{label}</span>
                    <span className={`numeral font-bold ${kind === 'you' ? 'text-accent' : 'text-ink'}`}>
                      {value.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-pill bg-surface-sunken">
                    <div
                      className={`h-full rounded-pill ${
                        kind === 'you' ? 'bg-accent' : kind === 'best' ? 'bg-gold' : 'bg-line-strong'
                      }`}
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {standing?.board.after !== null && standing && (
            <p className="mt-4 border-t border-line pt-3.5 text-sm text-ink-soft">
              <BoardDelta before={standing.board.before} after={standing.board.after} of={standing.board.of} />
            </p>
          )}
        </section>
      )}

      {/* A table, not four cards: eight figures a section is what a section is,
          and lined up in columns they can be compared down as well as across. */}
      <section className="mt-4">
        <h2 className="eyebrow">Section by section</h2>
        <div className="mt-3">
          <TableShell minWidth="54rem">
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <Th className="pl-4">Section</Th>
                <Th align="right">Marks</Th>
                <Th align="right">Attempted</Th>
                <Th align="right">Right</Th>
                <Th align="right">Wrong</Th>
                <Th align="right">Unanswered</Th>
                <Th>Accuracy</Th>
                <Th align="right" className="pr-4">Time</Th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, i) => {
                const acc = sec.accuracyPct
                const used = timeByCode.get(sec.code) ?? null
                return (
                  <tr key={sec.code} className="border-b border-line last:border-0">
                    <td className="py-3 pl-4 pr-3">
                      <span className="flex items-center gap-2.5">
                        <SectionShape index={i} />
                        <span className="min-w-0 font-semibold">{sectionName(pattern, sec.code as SectionCode)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`numeral text-lg font-black ${
                        sec.score > 0 ? 'text-ink' : sec.score < 0 ? 'text-bad-ink' : 'text-ink-faint'
                      }`}>
                        {sec.score.toFixed(2)}
                      </span>
                    </td>
                    <td className="numeral px-3 py-3 text-right text-ink-soft">{sec.attempted}</td>
                    <td className="numeral px-3 py-3 text-right font-bold text-good-ink">{sec.correct}</td>
                    <td className="numeral px-3 py-3 text-right font-bold text-bad-ink">{sec.wrong}</td>
                    <td className="numeral px-3 py-3 text-right text-ink-soft">
                      {sec.skipped + sec.notReached}
                    </td>
                    <td className="w-40 px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                          <span
                            className={`block h-full rounded-pill ${
                              acc === null ? '' : acc >= 60 ? 'bg-good' : acc >= 35 ? 'bg-warn' : 'bg-bad'
                            }`}
                            style={{ width: `${acc === null ? 0 : acc.toFixed(0)}%` }}
                          />
                        </span>
                        <span className="numeral w-10 shrink-0 text-right text-xs font-bold">
                          {acc === null ? '—' : `${acc.toFixed(0)}%`}
                        </span>
                      </div>
                    </td>
                    <td className="numeral px-3 py-3 pr-4 text-right text-ink-soft">{clock(used)}</td>
                  </tr>
                )
              })}
            </tbody>
          </TableShell>
        </div>
      </section>

      {(hasPacing || hasSlowest) && (
        <div className={`mt-4 grid gap-4 ${hasPacing && hasSlowest ? 'lg:grid-cols-2' : ''}`}>
          {hasPacing && (
            <section className="card p-5">
              <h2 className="eyebrow">Pacing</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {sections.map((sec) => {
                  const verdict = pacingVerdict(sec)
                  return verdict ? (
                    <li key={sec.code}>
                      <span className="font-semibold">{sectionName(pattern, sec.code as SectionCode)}:</span> {verdict}
                    </li>
                  ) : null
                })}
              </ul>
            </section>
          )}

          {hasSlowest && (
            <section className="card p-5">
              <h2 className="eyebrow">Where the time went</h2>
              <p className="mt-1 text-xs text-ink-soft">Your three slowest questions in each section.</p>
              <ul className="numeral mt-3 space-y-2 text-sm">
                {slowest.map((sec) => sec.questions.length ? (
                  <li key={sec.code}>
                    <span className="font-display font-semibold">{sectionName(pattern, sec.code)}:</span>{' '}
                    {sec.questions.map((q) => `Q${q.questionNumber} (${clock(q.timeSpentSec)})`).join(' · ')}
                  </li>
                ) : null)}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="eyebrow">Answers</h2>
          {unlocked && test.status === 'SCHEDULED' ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                Every question, its key and a worked solution, with yours marked.
              </p>
              <Link href={`/archive/${testId}`} className="btn btn-primary mt-3 px-5 py-2.5 text-sm">
                Review your answers
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">
              {unlocked
                ? 'This paper is not published, so it has no review page.'
                : `Answers and solutions unlock at ${paperLabels(paperWindow).hardStop}, for everyone at once.`}
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="eyebrow">Full screen</h2>
          <p className="numeral mt-2 text-sm">
            Left full screen <strong>{attempt.fullscreen_exits}</strong>{' '}
            {attempt.fullscreen_exits === 1 ? 'time' : 'times'} &middot; switched away{' '}
            <strong>{attempt.tab_switches}</strong> {attempt.tab_switches === 1 ? 'time' : 'times'}.
          </p>
          <p className="mt-1.5 text-xs text-ink-faint">
            Counted, never timed. Your admin sees the same two numbers.
          </p>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
        {practice && (
          <>
            <Link href={`/archive/${testId}`} className="btn btn-quiet">Read the solutions</Link>
            <Link href={`/test/start?test=${testId}&practice=1`} className="btn btn-quiet">
              Practise it again
            </Link>
          </>
        )}
      </div>
    </main>
  )
}

/** One figure in the headline band. */
function Tally({ label, value, hint }: {
  label: string
  value: React.ReactNode
  /** A second line, for the denominator a figure means nothing without. */
  hint?: string
}) {
  return (
    <div className="bg-surface-invert px-3.5 py-3">
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-white/60">{label}</dt>
      <dd className="numeral mt-0.5 text-xl font-bold leading-tight">{value}</dd>
      {hint && <dd className="numeral mt-0.5 text-[0.6875rem] text-white/50">{hint}</dd>}
    </div>
  )
}

/** "4th → 2nd", in words, for the cumulative board (PRD 6.6). */
function BoardDelta({ before, after, of }: { before: number | null; after: number; of: number }) {
  if (before === null) {
    return <>You join the all-time board at <strong>{ordinal(after)}</strong> of {of}.</>
  }
  if (before === after) {
    return <>You hold <strong>{ordinal(after)}</strong> of {of} on the all-time board.</>
  }
  const up = after < before
  return (
    <>
      All-time rank {ordinal(before)} &rarr; <strong>{ordinal(after)}</strong> of {of}{' '}
      <span className={up ? 'text-good-ink' : 'text-bad-ink'}>
        ({up ? 'up' : 'down'} {Math.abs(before - after)})
      </span>
    </>
  )
}

/** Seconds as m:ss; a dash when the figure is unknown. */
function clock(sec: number | null): string {
  if (sec === null) return '—'
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
