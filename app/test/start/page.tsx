import { redirect } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { findAttempt } from '../../../lib/repo/attempts'
import { sectionName, type SectionCode } from '../../../lib/types'
import { paperOnViewersTrack, patternForPaper } from '../../../lib/repo/tracks'
import { formatIstDate, paperLabels } from '../../../lib/time'
import { PAPER_WINDOW_COLUMNS, paperWindowOf } from '../../../lib/repo/papers'
import { beginAction } from './actions'
import { BeginButton } from './BeginButton'
import { entryRefusal, practiceRefusal } from './entry'
import { BackLink, Flash, PageHeader } from '../../../components/Page'
import { ExamRules } from '../../../components/ExamRules'
import { SectionShape } from '../../../components/SectionShape'
import { ThemeToggle } from '../../../components/ThemeToggle'

export const dynamic = 'force-dynamic'

/**
 * The pre-test briefing (FR-6.3.1).
 *
 * Everything that will surprise someone mid-test is stated here first: the
 * pattern and marking of this paper as stored (FR-3.2 lets a paper override
 * the defaults), the one-way section rule, that unused time is lost, and
 * exactly what the full-screen policy does and does not do. Begin is offered
 * only when it would work; otherwise the page says why.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()

  const { test: testId, error, practice: practiceParam } = await searchParams
  const practice = practiceParam === '1'
  if (!testId) redirect('/dashboard')

  const { data: test } = await db()
    .from('tests')
    .select(`id, title, status, track_id, ${PAPER_WINDOW_COLUMNS}, sections(code, position, duration_sec, question_count, marks_correct, marks_negative)`)
    .eq('id', testId).maybeSingle()
  if (!test) redirect('/dashboard')
  // A paper on another exam does not exist for this student, however they
  // came by its id (FR-6.10.1). Back to the dashboard, as for one that is
  // genuinely not there: which of the two it was is not their business.
  if (!(await paperOnViewersTrack(user, test.track_id as string | null))) redirect('/dashboard')

  // A dry run for an admin, a practice run for a student: the same engine and
  // the same timers, counted nowhere either way.
  const isDryRun = user.role === 'admin' || practice
  const sections = ((test.sections ?? []) as {
    code: SectionCode; position: number; duration_sec: number; question_count: number
    marks_correct: number; marks_negative: number
  }[]).sort((a, b) => a.position - b.position)
  const totalQuestions = sections.reduce((n, s) => n + s.question_count, 0)
  const totalMinutes = Math.round(sections.reduce((n, s) => n + s.duration_sec, 0) / 60)
  // What a flawless paper is worth, so the marking card can end on it.
  const totalMarks = sections.reduce(
    (n, s) => n + Number(s.question_count) * Number(s.marks_correct), 0,
  )
  const marks = new Set(sections.map((s) => `+${Number(s.marks_correct)} correct, −${Number(s.marks_negative)} wrong`))

  // A counted paper already sat goes to its result; a running one resumes.
  const existing = await findAttempt(testId, user.id, isDryRun)
  if (existing?.state === 'IN_PROGRESS') redirect(`/test/${existing.id}`)
  if (existing && !isDryRun) redirect(`/test/${existing.id}/done`)

  const pattern = await patternForPaper(testId)
  const paperWindow = paperWindowOf(test)
  const refusal = isDryRun ? null : entryRefusal(test.status as string, paperWindow)

  return (
    <main className="shell py-8">
      <div className="flex items-center justify-between gap-3">
  <BackLink href={
          practice ? `/archive/${testId}`
            : user.role === 'admin' ? `/admin/papers/${testId}` : '/dashboard'
        }>Back</BackLink>
        <ThemeToggle />
      </div>

      <PageHeader
        title={test.title ?? 'Daily mock'}
        meta={<span className="numeral">{formatIstDate(test.date as string)}</span>}
      />

      {practice ? (
        <Flash tone="warn" className="mt-4 text-sm">
          This is practice. The engine, the timers and the marking are the real ones; the result is
          yours alone. Nothing here reaches the leaderboard, and your counted score on this paper
          does not move. Practising again replaces the practice result before it.
        </Flash>
      ) : isDryRun && (
        <Flash tone="warn" className="mt-4 text-sm">
          This is a dry run. It uses the real engine and the real timers, but it is never counted
          and never appears on the leaderboard.
        </Flash>
      )}

      {error && (
        <Flash tone="bad" className="mt-4">{error}</Flash>
      )}

      {/* The paper you are about to sit, laid out the way the result will lay
          it back out afterwards: four sections, each behind its own answer
          shape. It used to be a list of figures with a number in front of it,
          which told you the same thing and showed you nothing. */}
      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="eyebrow">What you are about to sit</h2>
          <p className="numeral text-sm font-bold">
            {totalQuestions} questions &middot; {totalMinutes} minutes
          </p>
        </div>

        <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((s, i) => (
            <li key={s.code} className="card p-5">
              <div className="flex items-center gap-3">
                <SectionShape index={i} size="lg" />
                <span className="numeral text-xs font-bold text-ink-faint">
                  Section {s.position}
                </span>
              </div>
              <h3 className="mt-3 font-display text-base font-black leading-tight">
                {sectionName(pattern, s.code)}
              </h3>
              <p className="numeral mt-2.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-black">{s.question_count}</span>
                <span className="text-xs font-semibold text-ink-faint">questions</span>
              </p>
              <p className="numeral mt-2 border-t border-line pt-2.5 text-xs text-ink-soft">
                {Math.round(s.duration_sec / 60)} minutes &middot; +{Number(s.marks_correct)}
                {' '}/ &minus;{Number(s.marks_negative)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <section className="card p-6">
          <h2 className="eyebrow">Before you begin</h2>
          <div className="mt-3"><ExamRules /></div>
          <p className="mt-3 border-t border-line pt-3 text-sm font-semibold">
            Your timer starts the moment you press the button, not when this page opened.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <section className="card flex flex-1 flex-col p-6">
          <h2 className="eyebrow">Marking</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">A right answer</dt>
              <dd className="numeral font-bold text-good-ink">
                +{Number(sections[0]?.marks_correct ?? 1)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">A wrong answer</dt>
              <dd className="numeral font-bold text-bad-ink">
                &minus;{Number(sections[0]?.marks_negative ?? 0)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Left blank</dt>
              <dd className="numeral font-bold">0</dd>
            </div>
          </dl>
          {marks.size > 1 && (
            <p className="mt-3 text-xs text-ink-faint">
              Marking varies by section; each card above carries its own.
            </p>
          )}
          <p className="numeral mt-auto border-t border-line pt-3 text-sm">
            <span className="font-bold">{totalMarks}</span>
            <span className="text-ink-faint"> marks for a perfect paper</span>
          </p>
          </section>

          {/* Begin sits under the marking rather than centred below both
              columns: it keeps the right-hand column the same height as the
              rules beside it, and puts the button where the eye already is. */}
          {refusal ? (
            <p className="card px-5 py-4 text-center font-semibold">{refusal}</p>
          ) : (
            <div className="card p-6">
              <form action={beginAction}>
                <input type="hidden" name="testId" value={String(test.id)} />
                {practice && <input type="hidden" name="practice" value="1" />}
                <BeginButton label={practice ? 'Start practising' : 'Begin'} />
              </form>
              <p className="mt-3 text-center text-sm text-ink-soft">
                {practice
                  ? 'Your counted score on this paper stays exactly as it is.'
                  : isDryRun
                    ? 'Nothing here is counted.'
                    : `Entry closes at ${paperLabels(paperWindow).closes}.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
