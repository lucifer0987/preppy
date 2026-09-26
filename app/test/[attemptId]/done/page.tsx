import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '../../../../lib/guard'
import { db } from '../../../../lib/supabase/admin'
import { SECTION_NAMES, type SectionCode } from '../../../../lib/types'
import {
  pacingVerdict, scoreBounds, sectionTimeUsed, slowestQuestions, type SectionScore,
} from '../../../../lib/scoring'
import { ordinal } from '../../../../lib/leaderboard'
import { getPaperById } from '../../../../lib/repo/papers'
import { getResultStanding, type ResultStanding } from '../../../../lib/repo/leaderboard'
import { formatIstDate, paperClosed, paperLabels } from '../../../../lib/time'
import { paperWindowOf } from '../../../../lib/repo/papers'
import { Celebration, type CelebrationLevel } from '../../../../components/Celebration'
import { CountUp } from '../../../../components/CountUp'
import { ResultSound } from '../../../../components/ResultSound'
import { SoundToggle } from '../../../../components/SoundToggle'

export const dynamic = 'force-dynamic'

/**
 * The result (PRD section 6.6).
 *
 * Everything here is about this student and nobody else (FR-5.3): no cohort
 * average, no comparison bars. The score and its breakdown are shown the
 * moment the student submits. The two rank figures, the only cohort-derived
 * numbers, wait for the leaderboard's 00:01 refresh, so nobody can learn from
 * a rank who else has sat tonight's paper. Answers unlock at midnight (FR-4.3).
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
    .select('id, user_id, test_id, state, is_dry_run, total_score, section_scores, attempted, correct, wrong, skipped, not_reached, time_spent_sec, fullscreen_exits, tab_switches, rescored_at, tests(date, title, status, opens_at_min, entry_closes_at_min, attempt_sec)')
    .eq('id', attemptId)
    .maybeSingle()

  if (!attempt || attempt.user_id !== user.id) redirect('/dashboard')
  if (attempt.state === 'IN_PROGRESS') redirect(`/test/${attemptId}`)

  const test = attempt.tests as unknown as Record<string, unknown> & { date: string; title: string | null; status: string }
  const paperWindow = paperWindowOf(test)
  const testId = attempt.test_id as string
  const sections = (attempt.section_scores ?? []) as SectionScore[]
  const score = Number(attempt.total_score ?? 0)
  const unlocked = paperClosed(paperWindow)
  const minutes = Math.round((attempt.time_spent_sec ?? 0) / 60)
  // A voided attempt is shown but is not ranked, and neither is a dry run.
  const counted = !attempt.is_dry_run && attempt.state !== 'VOIDED'
  const ranked = counted && paperClosed(paperWindow)

  const [record, sectionRows, responseRows, earlier, standing] = await Promise.all([
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
      ? getResultStanding(user.id, paperWindow).catch((e: Error) => {
          console.error('[result] could not compute standing', e.message)
          return null
        })
      : Promise.resolve<ResultStanding | null>(null),
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

  const celebration: CelebrationLevel =
    !counted ? 'none'
    : isPersonalBest ? 'personal-best'
    : 'good'

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* Keyed on the attempt, so the moment fires once, not on every revisit. */}
      <Celebration level={celebration} onceKey={`result.${attemptId}`} />
      <ResultSound
        tune={!user.soundEnabled || celebration === 'none' ? null : celebration === 'personal-best' ? 'personal-best' : 'result'}
        onceKey={`result.${attemptId}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          {test.title ?? 'Daily mock'} &middot; {formatIstDate(test.date)}
        </p>
        <SoundToggle initial={user.soundEnabled} compact />
      </div>

      {attempt.rescored_at && counted && (
        <p className="mt-4 rounded-control bg-play-yellow/20 px-5 py-4 text-sm font-semibold">
          An answer key on this paper was corrected after it ran, and your score changed as a
          result. The score below is the corrected one.
        </p>
      )}

      <section className="mt-4 rounded-card bg-play-purple p-8 text-center text-white">
        {attempt.is_dry_run && (
          <p className="mb-3 inline-block rounded-full bg-surface/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            Dry run &middot; not counted
          </p>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Your score</p>
        <p className="mt-2 text-7xl font-black tabular-nums"><CountUp value={score} /></p>
        {bounds && <p className="mt-1 text-white/70">out of {bounds.max}</p>}
        {standing?.paper && (
          <p className="mt-3 text-2xl font-black">
            {ordinal(standing.paper.rank)} of {standing.paper.of}
          </p>
        )}
        {counted && !ranked && (
          <p className="mt-3 text-sm font-semibold text-white/80">
            Your rank on this paper appears at {paperLabels(paperWindow).hardStop}, when
            the leaderboard takes in tonight&rsquo;s results.
          </p>
        )}
        {isPersonalBest && (
          <p className="chip btn-invert mt-3 inline-block px-4 py-1.5 text-sm">
            Personal best
          </p>
        )}
        <p className="mt-4 text-sm text-white/70 tabular-nums">
          {attempt.correct} correct &middot; {attempt.wrong} wrong &middot;{' '}
          {attempt.skipped} skipped &middot; {attempt.not_reached} not reached &middot; {minutes} min
        </p>
      </section>

      {standing && standing.board.after !== null && (
        <section className="mt-4 rounded-card bg-surface p-5">
          <h2 className="eyebrow">Leaderboard</h2>
          <p className="mt-2 text-sm">
            <BoardDelta before={standing.board.before} after={standing.board.after} of={standing.board.of} />
          </p>
        </section>
      )}

      <section className="mt-4 overflow-x-auto rounded-card bg-surface p-5">
        <h2 className="eyebrow">By section</h2>
        <table className="mt-3 w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
              <th className="py-2 pr-3 font-bold">Section</th>
              <th className="py-2 px-2 text-right font-bold">Score</th>
              <th className="py-2 px-2 text-right font-bold">Attempted</th>
              <th className="py-2 px-2 text-right font-bold">Right</th>
              <th className="py-2 px-2 text-right font-bold">Wrong</th>
              <th className="py-2 px-2 text-right font-bold">Skipped</th>
              <th className="py-2 px-2 text-right font-bold">Not reached</th>
              <th className="py-2 px-2 text-right font-bold">Accuracy</th>
              <th className="py-2 pl-2 text-right font-bold">Time used</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.code} className="border-t border-line">
                <td className="py-2 pr-3 font-semibold">{SECTION_NAMES[s.code as SectionCode]}</td>
                <td className="py-2 px-2 text-right font-bold">{s.score.toFixed(2)}</td>
                <td className="py-2 px-2 text-right">{s.attempted}</td>
                <td className="py-2 px-2 text-right text-good">{s.correct}</td>
                <td className="py-2 px-2 text-right text-bad">{s.wrong}</td>
                <td className="py-2 px-2 text-right">{s.skipped}</td>
                <td className="py-2 px-2 text-right">{s.notReached}</td>
                <td className="py-2 px-2 text-right">
                  {s.accuracyPct === null ? '—' : `${s.accuracyPct.toFixed(0)}%`}
                </td>
                <td className="py-2 pl-2 text-right">{clock(timeByCode.get(s.code) ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sections.some((s) => pacingVerdict(s)) && (
        <section className="mt-4 rounded-card bg-surface p-5">
          <h2 className="eyebrow">Pacing</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {sections.map((s) => {
              const verdict = pacingVerdict(s)
              return verdict ? (
                <li key={s.code}>
                  <span className="font-semibold">{SECTION_NAMES[s.code as SectionCode]}:</span> {verdict}
                </li>
              ) : null
            })}
          </ul>
        </section>
      )}

      {slowest.some((s) => s.questions.length) && (
        <section className="mt-4 rounded-card bg-surface p-5">
          <h2 className="eyebrow">Where the time went</h2>
          <p className="mt-1 text-xs text-ink-soft">Your three slowest questions in each section.</p>
          <ul className="mt-3 space-y-2 text-sm tabular-nums">
            {slowest.map((s) => s.questions.length ? (
              <li key={s.code}>
                <span className="font-semibold">{SECTION_NAMES[s.code]}:</span>{' '}
                {s.questions.map((q) => `Q${q.questionNumber} (${clock(q.timeSpentSec)})`).join(' · ')}
              </li>
            ) : null)}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-card bg-surface p-5">
        <h2 className="eyebrow">Full screen</h2>
        <p className="mt-2 text-sm tabular-nums">
          Left full screen <strong>{attempt.fullscreen_exits}</strong>{' '}
          {attempt.fullscreen_exits === 1 ? 'time' : 'times'} &middot; switched away{' '}
          <strong>{attempt.tab_switches}</strong> {attempt.tab_switches === 1 ? 'time' : 'times'}.
        </p>
      </section>

      <section className="mt-4 rounded-card bg-surface p-5">
        <h2 className="eyebrow">Answers</h2>
        {unlocked && test.status === 'SCHEDULED' ? (
          <Link
            href={`/archive/${testId}`}
            className="mt-3 inline-block rounded-control bg-play-purple px-5 py-2.5 text-sm font-black text-white"
          >
            Review your answers
          </Link>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {unlocked
              ? 'This paper is not published, so it has no review page.'
              : 'Answers and solutions unlock at midnight, for everyone at once.'}
          </p>
        )}
      </section>

      <Link
        href="/dashboard"
        className="mt-8 inline-block rounded-control bg-play-purple px-6 py-3 font-black text-white"
      >
        Back to dashboard
      </Link>
    </main>
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
      <span className={up ? 'text-good' : 'text-bad'}>
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
