import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { getPaperById } from '../../../lib/repo/papers'
import { QuestionCard } from '../../../components/QuestionCard'
import { DirectionsBlock } from '../../../components/DirectionsBlock'
import { SECTION_NAMES, type OptionLabel, type SectionCode } from '../../../lib/types'
import { answersUnlocked, formatIstDate } from '../../../lib/time'

export const dynamic = 'force-dynamic'

/**
 * Reviewing one paper (FR-6.3.2, FR-6.3.3).
 *
 * Answers stay sealed until midnight for everyone, including someone who has
 * already submitted (FR-4.3). Where the student attempted the paper, each
 * question also shows what they picked, and whether an unanswered one was
 * skipped or never reached.
 */
export default async function ArchiveDetail({
  params, searchParams,
}: { params: Promise<{ testId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { testId } = await params
  const { filter, section: sectionFilter } = await searchParams
  const user = await requireUser()

  // Only published papers are reviewable. A draft is the admin's work in
  // progress, and one dated in the past would otherwise open to anyone who
  // had its id.
  const record = await getPaperById(testId)
  if (!record || record.status !== 'SCHEDULED') notFound()
  const { paper } = record

  if (!answersUnlocked(paper.date)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-3xl font-black">Sealed until midnight</h1>
        <p className="mt-3 text-ink-soft">
          Answers and solutions for {formatIstDate(paper.date)} unlock at midnight, for everyone at
          the same moment.
        </p>
        <Link href="/archive" className="mt-6 inline-block font-bold text-play-purple underline">
          Back to past papers
        </Link>
      </main>
    )
  }

  const { data: attempt } = await db()
    .from('attempts').select('id').eq('test_id', testId).eq('user_id', user.id)
    .eq('is_dry_run', false).in('state', ['SUBMITTED', 'AUTO_SUBMITTED']).maybeSingle()

  const mine = new Map<number, { selected: OptionLabel | null; visited: boolean; timeSpentSec: number }>()
  if (attempt) {
    const { data: rows, error } = await db()
      .from('responses').select('selected_option, was_visited, time_spent_sec, questions(number)')
      .eq('attempt_id', attempt.id)
    // Showing "you never reached this" on every question because the read
    // failed would be worse than no page.
    if (error) throw new Error(`Could not load your answers: ${error.message}`)
    for (const r of rows ?? []) {
      mine.set((r.questions as unknown as { number: number }).number, {
        selected: (r.selected_option as OptionLabel | null) ?? null,
        visited: r.was_visited as boolean,
        timeSpentSec: (r.time_spent_sec as number) ?? 0,
      })
    }
  }

  const keep = (n: number, answer: OptionLabel) => {
    if (!attempt) return true
    const r = mine.get(n)
    if (filter === 'wrong') return Boolean(r?.selected) && r!.selected !== answer
    if (filter === 'missed') return !r || !r.visited
    return true
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/archive" className="text-sm font-bold text-play-purple">&larr; Past papers</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">{paper.title ?? 'Daily mock'}</h1>
      <p className="mt-1 text-ink-soft">{formatIstDate(paper.date)}</p>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filter by section">
        {[['All sections', undefined] as const, ...paper.sections.map((s) => [SECTION_NAMES[s.code as SectionCode], s.code] as const)].map(
          ([label, value]) => (
            <FilterLink key={label} label={label}
                        href={hrefFor(testId, { filter, section: value })}
                        active={(value ?? undefined) === sectionFilter} />
          ),
        )}
      </nav>
      {attempt && (
        <nav className="mt-2 flex flex-wrap gap-2" aria-label="Filter by your answers">
          {([['Everything', undefined], ['I got these wrong', 'wrong'], ['I never reached these', 'missed']] as const).map(
            ([label, value]) => (
              <FilterLink key={label} label={label}
                          href={hrefFor(testId, { filter: value, section: sectionFilter })}
                          active={(value ?? undefined) === filter} />
            ),
          )}
        </nav>
      )}

      {!attempt && (
        <p className="mt-5 rounded-2xl bg-white px-5 py-4 text-sm text-ink-soft">
          You did not sit this paper, so there is nothing of yours to compare. The questions and
          solutions are all here.
        </p>
      )}

      {paper.sections.filter((s) => !sectionFilter || s.code === sectionFilter).map((section) => {
        const visible = section.questions.filter((q) => keep(q.number, q.answer))
        if (!visible.length) return null
        return (
          <section key={section.code} className="mt-8">
            <h2 className="text-lg font-black">{SECTION_NAMES[section.code as SectionCode]}</h2>
            <ol className="mt-3 space-y-4">
              {visible.map((question) => {
                const block = section.directions?.find(
                  (b) => question.number >= b.from && question.number <= b.to,
                )
                const r = mine.get(question.number)
                return (
                  <li key={question.number} className="rounded-3xl bg-white p-5">
                    {block && <DirectionsBlock block={block} testId={testId} />}
                    {attempt && (
                      <p className="mb-3 flex flex-wrap gap-x-3 text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                        <span>
                          {!r || !r.visited ? 'You never reached this'
                            : r.selected === null ? 'You saw this and skipped it'
                            : r.selected === question.answer ? 'You got this right'
                            : 'You got this wrong'}
                        </span>
                        {r && r.visited && r.timeSpentSec > 0 && (
                          <span className="tabular-nums">Your time {clock(r.timeSpentSec)}</span>
                        )}
                      </p>
                    )}
                    <QuestionCard question={question} testId={testId} selected={r?.selected ?? null} reveal disabled />
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </main>
  )
}

function hrefFor(testId: string, q: { filter?: string; section?: string }): string {
  const params = new URLSearchParams()
  if (q.section) params.set('section', q.section)
  if (q.filter) params.set('filter', q.filter)
  const qs = params.toString()
  return qs ? `/archive/${testId}?${qs}` : `/archive/${testId}`
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'rounded-full px-4 py-2 text-sm font-bold transition',
        active ? 'bg-play-purple text-white' : 'bg-white text-ink-soft hover:bg-black/5',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

/** Seconds as m:ss. */
function clock(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
