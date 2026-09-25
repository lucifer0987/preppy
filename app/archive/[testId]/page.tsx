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
  const { filter } = await searchParams
  const user = await requireUser()

  const record = await getPaperById(testId)
  if (!record) notFound()
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

  const mine = new Map<number, { selected: OptionLabel | null; visited: boolean }>()
  if (attempt) {
    const { data: rows } = await db()
      .from('responses').select('selected_option, was_visited, questions(number)')
      .eq('attempt_id', attempt.id)
    for (const r of rows ?? []) {
      mine.set((r.questions as unknown as { number: number }).number, {
        selected: (r.selected_option as OptionLabel | null) ?? null,
        visited: r.was_visited as boolean,
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

      {attempt && (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filter">
          {[['Everything', undefined], ['I got these wrong', 'wrong'], ['I never reached these', 'missed']].map(
            ([label, value]) => {
              const active = (value ?? undefined) === filter || (!value && !filter)
              return (
                <Link
                  key={label as string}
                  href={value ? `/archive/${testId}?filter=${value}` : `/archive/${testId}`}
                  className={[
                    'rounded-full px-4 py-2 text-sm font-bold transition',
                    active ? 'bg-play-purple text-white' : 'bg-white text-ink-soft hover:bg-black/5',
                  ].join(' ')}
                >
                  {label as string}
                </Link>
              )
            },
          )}
        </nav>
      )}

      {!attempt && (
        <p className="mt-5 rounded-2xl bg-white px-5 py-4 text-sm text-ink-soft">
          You did not sit this paper, so there is nothing of yours to compare. The questions and
          solutions are all here.
        </p>
      )}

      {paper.sections.map((section) => {
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
                    {block && <DirectionsBlock block={block} />}
                    {attempt && (
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                        {!r || !r.visited ? 'You never reached this'
                          : r.selected === null ? 'You saw this and skipped it'
                          : r.selected === question.answer ? 'You got this right'
                          : 'You got this wrong'}
                      </p>
                    )}
                    <QuestionCard question={question} selected={r?.selected ?? null} reveal disabled />
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
