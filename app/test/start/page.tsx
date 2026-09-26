import { redirect } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { findAttempt } from '../../../lib/repo/attempts'
import { SECTION_NAMES, type SectionCode } from '../../../lib/types'
import { formatIstDate, paperLabels } from '../../../lib/time'
import { PAPER_WINDOW_COLUMNS, paperWindowOf } from '../../../lib/repo/papers'
import { beginAction } from './actions'
import { BeginButton } from './BeginButton'
import { entryRefusal } from './entry'
import { BackLink, Flash } from '../../../components/Page'
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

  const { test: testId, error } = await searchParams
  if (!testId) redirect('/dashboard')

  const { data: test } = await db()
    .from('tests')
    .select(`id, title, status, ${PAPER_WINDOW_COLUMNS}, sections(code, position, duration_sec, question_count, marks_correct, marks_negative)`)
    .eq('id', testId).maybeSingle()
  if (!test) redirect('/dashboard')

  const isDryRun = user.role === 'admin'
  const sections = ((test.sections ?? []) as {
    code: SectionCode; position: number; duration_sec: number; question_count: number
    marks_correct: number; marks_negative: number
  }[]).sort((a, b) => a.position - b.position)
  const totalQuestions = sections.reduce((n, s) => n + s.question_count, 0)
  const totalMinutes = Math.round(sections.reduce((n, s) => n + s.duration_sec, 0) / 60)
  const marks = new Set(sections.map((s) => `+${Number(s.marks_correct)} correct, −${Number(s.marks_negative)} wrong`))

  // A counted paper already sat goes to its result; a running one resumes.
  const existing = await findAttempt(testId, user.id, isDryRun)
  if (existing?.state === 'IN_PROGRESS') redirect(`/test/${existing.id}`)
  if (existing && !isDryRun) redirect(`/test/${existing.id}/done`)

  const paperWindow = paperWindowOf(test)
  const refusal = isDryRun ? null : entryRefusal(test.status as string, paperWindow)

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between gap-3">
        <BackLink href={isDryRun ? `/admin/papers/${testId}` : '/dashboard'}>Back</BackLink>
        <ThemeToggle />
      </div>

      <h1 className="mt-4 text-4xl font-black tracking-tight">{test.title ?? 'Daily mock'}</h1>
      <p className="mt-1 text-ink-soft">{formatIstDate(test.date as string)}</p>

      {isDryRun && (
        <Flash tone="warn" className="mt-4 text-sm">
          This is a dry run. It uses the real engine and the real timers, but it is never counted
          and never appears on the leaderboard.
        </Flash>
      )}

      {error && (
        <Flash tone="bad" className="mt-4">{error}</Flash>
      )}

      <section className="mt-6 card p-6">
        <h2 className="eyebrow">The pattern</h2>
        <ul className="mt-3 space-y-1.5">
          {sections.map((s) => (
            <li key={s.code} className="flex items-baseline justify-between gap-4 text-sm">
              <span><span className="mr-2 font-mono text-ink-soft">{s.position}.</span>{SECTION_NAMES[s.code]}</span>
              <span className="tabular-nums text-ink-soft">
                {s.question_count} q &middot; {Math.round(s.duration_sec / 60)} min
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 font-semibold tabular-nums">
          {totalQuestions} questions &middot; {totalMinutes} minutes &middot;{' '}
          {marks.size === 1 ? [...marks][0] : 'marking varies by section'}, 0 unattempted
        </p>
        {marks.size > 1 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {sections.map((s) => (
              <li key={s.code}>{SECTION_NAMES[s.code]}: +{Number(s.marks_correct)} correct, −{Number(s.marks_negative)} wrong</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 card p-6">
        <h2 className="eyebrow">Before you begin</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          <li><strong>Sections run in order and only forward.</strong> Once you leave a section you cannot return to it.</li>
          <li><strong>Each section has its own timer.</strong> Finishing early does not add time to the next one.</li>
          <li><strong>Full screen is required.</strong> Your browser will always let you leave it with Esc; if you do, the question is covered until you return, the count is recorded and shown on your result, and <strong>your timer keeps running</strong>. It never ends your test. It is a deterrent, not a lock.</li>
          <li><strong>Two numbers are recorded:</strong> how many times you left full screen, and how many times you switched away. Your admin sees them too. Nothing else is logged.</li>
          <li><strong>One device at a time.</strong> Beginning signs your account out everywhere else.</li>
          <li><strong>Your timer starts the moment you press Begin</strong>, not when this page opened.</li>
        </ul>
      </section>

      {refusal ? (
        <p className="mt-6 rounded-control bg-surface px-5 py-4 text-center font-semibold">{refusal}</p>
      ) : (
        <>
          <form action={beginAction} className="mt-6">
            <input type="hidden" name="testId" value={String(test.id)} />
            <BeginButton />
          </form>
          {!isDryRun && (
            <p className="mt-3 text-center text-sm text-ink-soft">
              Entry closes at {paperLabels(paperWindow).closes}.
            </p>
          )}
        </>
      )}
    </main>
  )
}
