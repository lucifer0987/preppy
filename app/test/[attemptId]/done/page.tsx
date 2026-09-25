import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '../../../../lib/guard'
import { db } from '../../../../lib/supabase/admin'
import { SECTION_NAMES, TOTAL_QUESTIONS, type SectionCode } from '../../../../lib/types'
import { pacingVerdict, type SectionScore } from '../../../../lib/scoring'
import { answersUnlocked, formatIstDate } from '../../../../lib/time'
import { Celebration, type CelebrationLevel } from '../../../../components/Celebration'
import { CountUp } from '../../../../components/CountUp'
import { ResultSound } from '../../../../components/ResultSound'
import { SoundToggle } from '../../../../components/SoundToggle'

export const dynamic = 'force-dynamic'

/**
 * The result (PRD section 6.6).
 *
 * Everything here is about this student and nobody else (FR-5.3): no cohort
 * average, no comparison bars, no indication of who else has submitted. Rank
 * arrives with the leaderboard slice; answers unlock at midnight (FR-4.3).
 */
export default async function DonePage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const user = await requireUser()

  const { data: attempt } = await db()
    .from('attempts')
    .select('id, user_id, state, is_dry_run, total_score, section_scores, attempted, correct, wrong, skipped, not_reached, time_spent_sec, fullscreen_exits, tab_switches, tests(date, title, rescored_at)')
    .eq('id', attemptId)
    .maybeSingle()

  if (!attempt || attempt.user_id !== user.id) redirect('/dashboard')
  if (attempt.state === 'IN_PROGRESS') redirect(`/test/${attemptId}`)

  const test = attempt.tests as unknown as { date: string; title: string | null; rescored_at: string | null }
  const sections = (attempt.section_scores ?? []) as SectionScore[]
  const score = Number(attempt.total_score ?? 0)
  const unlocked = answersUnlocked(test.date)
  const minutes = Math.round((attempt.time_spent_sec ?? 0) / 60)

  // A dry run is not an achievement, and a celebration over a poor score reads
  // as mockery. Best previous score decides whether this one is a personal best.
  const { data: earlier } = await db()
    .from('attempts').select('total_score')
    .eq('user_id', user.id).eq('is_dry_run', false)
    .in('state', ['SUBMITTED', 'AUTO_SUBMITTED'])
    .neq('id', attemptId)
  const best = (earlier ?? []).reduce((a, r) => Math.max(a, Number(r.total_score ?? 0)), -Infinity)
  const isPersonalBest = (earlier ?? []).length > 0 && score > best

  const celebration: CelebrationLevel =
    attempt.is_dry_run ? 'none'
    : isPersonalBest ? 'personal-best'
    : score >= TOTAL_QUESTIONS * 0.5 ? 'good'
    : 'none'

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Celebration level={celebration} />
      <ResultSound tune={celebration === 'none' ? null : celebration === 'personal-best' ? 'personal-best' : 'result'} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">
          {test.title ?? 'Daily mock'} &middot; {formatIstDate(test.date)}
        </p>
        <SoundToggle compact />
      </div>

      {test.rescored_at && (
        <p className="mt-4 rounded-2xl bg-play-yellow/20 px-5 py-4 text-sm font-semibold">
          An answer key on this paper was corrected after it ran, so every attempt was rescored.
          The score below is the corrected one.
        </p>
      )}

      <section className="mt-4 rounded-3xl bg-play-purple p-8 text-center text-white">
        {attempt.is_dry_run && (
          <p className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            Dry run &middot; not counted
          </p>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Your score</p>
        <p className="mt-2 text-7xl font-black tabular-nums"><CountUp value={score} /></p>
        <p className="mt-1 text-white/70">out of {TOTAL_QUESTIONS}</p>
        {isPersonalBest && !attempt.is_dry_run && (
          <p className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-sm font-black text-play-purple">
            Personal best
          </p>
        )}
        <p className="mt-4 text-sm text-white/70 tabular-nums">
          {attempt.correct} correct &middot; {attempt.wrong} wrong &middot;{' '}
          {attempt.skipped} skipped &middot; {attempt.not_reached} not reached &middot; {minutes} min
        </p>
      </section>

      <section className="mt-4 overflow-x-auto rounded-3xl bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">By section</h2>
        <table className="mt-3 w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
              <th className="py-2 pr-3 font-bold">Section</th>
              <th className="py-2 px-2 text-right font-bold">Score</th>
              <th className="py-2 px-2 text-right font-bold">Right</th>
              <th className="py-2 px-2 text-right font-bold">Wrong</th>
              <th className="py-2 px-2 text-right font-bold">Skipped</th>
              <th className="py-2 px-2 text-right font-bold">Not reached</th>
              <th className="py-2 pl-2 text-right font-bold">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.code} className="border-t border-black/10">
                <td className="py-2 pr-3 font-semibold">{SECTION_NAMES[s.code as SectionCode]}</td>
                <td className="py-2 px-2 text-right font-bold">{s.score.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-answered">{s.correct}</td>
                <td className="py-2 px-2 text-right text-notanswered">{s.wrong}</td>
                <td className="py-2 px-2 text-right">{s.skipped}</td>
                <td className="py-2 px-2 text-right">{s.notReached}</td>
                <td className="py-2 pl-2 text-right">
                  {s.accuracyPct === null ? '—' : `${s.accuracyPct.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sections.some((s) => pacingVerdict(s)) && (
        <section className="mt-4 rounded-3xl bg-white p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Pacing</h2>
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

      <section className="mt-4 rounded-3xl bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Full screen</h2>
        <p className="mt-2 text-sm tabular-nums">
          Left full screen <strong>{attempt.fullscreen_exits}</strong>{' '}
          {attempt.fullscreen_exits === 1 ? 'time' : 'times'} &middot; switched away{' '}
          <strong>{attempt.tab_switches}</strong> {attempt.tab_switches === 1 ? 'time' : 'times'}.
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Answers</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {unlocked
            ? 'Answers and solutions are available now.'
            : 'Answers and solutions unlock at midnight, for everyone at once.'}
        </p>
      </section>

      <Link
        href="/dashboard"
        className="mt-8 inline-block rounded-2xl bg-play-purple px-6 py-3 font-black text-white"
      >
        Back to dashboard
      </Link>
    </main>
  )
}
