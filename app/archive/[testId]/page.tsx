import Link from 'next/link'
import { AppShell } from '../../../components/AppShell'
import { BackLink, PageHeader } from '../../../components/Page'
import { notFound } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { getPaperById } from '../../../lib/repo/papers'
import { QuestionCard } from '../../../components/QuestionCard'
import { DirectionsBlock } from '../../../components/DirectionsBlock'
import { sectionName, type OptionLabel, type SectionCode } from '../../../lib/types'
import { paperOnViewersTrack, patternForPaper, viewerTrack } from '../../../lib/repo/tracks'
import { formatIstDate, paperClosed } from '../../../lib/time'
import { findAttempt } from '../../../lib/repo/attempts'

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
  // Another exam's paper is not this student's to read, closed or not. Not
  // found rather than refused: which exam a paper belongs to is not something
  // they need told (FR-6.10.1).
  if (!(await paperOnViewersTrack(user, record.trackId))) notFound()
  const { paper } = record
  // Section names come from the paper's own track, so an Agriculture paper
  // never says (CSE).
  const pattern = await patternForPaper(testId)
  const examName = (await viewerTrack(user))?.name ?? null

  // A paper opens to you the moment you finish it; to everybody once it has
  // closed. The one thing this page must never do is hand the answers to
  // somebody who can still sit it -- so the gate is the viewer's own attempt,
  // not the clock. An admin sees every paper anyway, from the console.
  const settled = paperClosed(record.window)
  const own = await findAttempt(testId, user.id, false)
  const finished = Boolean(own && own.state !== 'IN_PROGRESS' && own.state !== 'VOIDED')
  if (!settled && !finished && user.role !== 'admin') {
    return (
      <main className="shell py-12">
        <div className="card mx-auto max-w-xl p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft mx-auto">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-accent">
              <path d="M10 1.5a4 4 0 00-4 4V8H5.5A1.5 1.5 0 004 9.5v7A1.5 1.5 0 005.5 18h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 8H14V5.5a4 4 0 00-4-4zm-2 4a2 2 0 114 0V8H8V5.5z" />
            </svg>
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight">Sit it first</h1>
          <p className="mx-auto mt-2 max-w-md text-ink-soft">
            You can still take the paper for {formatIstDate(paper.date)}, so its answers stay
            shut. Hand it in and they open straight away. Once entry closes they open to
            everybody, whether they sat it or not.
          </p>
          <Link href="/archive" className="btn btn-quiet mt-6 inline-flex">
            Back to past papers
          </Link>
        </div>
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
    <AppShell user={user} current="archive" examName={examName}>
    <main className="shell pt-6">
      <BackLink href="/archive">Past papers</BackLink>
      <PageHeader
        title={paper.title ?? 'Daily mock'}
        meta={<span className="numeral">{formatIstDate(paper.date)}</span>}
        lede="Every question with its key and worked solution. Yours are marked where you answered."
        actions={user.role === 'student' ? (
          <Link href={`/test/start?test=${testId}&practice=1`} className="btn btn-quiet">
            Sit it again as practice
          </Link>
        ) : undefined}
      />

      {/* Reading a paper is a reading task, so the questions keep a measure
          rather than stretching to 1900px. The width goes to the filters
          instead: a rail that stays put while you scroll, where before they
          were two rows of chips you scrolled away from and lost. */}
      <div className="mt-5 grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-10">
        <div className="xl:sticky xl:top-24 xl:self-start">
          <nav className="flex flex-wrap gap-2 xl:flex-col xl:items-start" aria-label="Filter by section">
            <h2 className="eyebrow w-full">Sections</h2>
            {[['All sections', undefined] as const, ...paper.sections.map((s) => [sectionName(pattern, s.code as SectionCode), s.code] as const)].map(
              ([label, value], i) => (
                <FilterLink key={label} label={label}
                            shape={i === 0 ? undefined : i - 1}
                            href={hrefFor(testId, { filter, section: value })}
                            active={(value ?? undefined) === sectionFilter} />
              ),
            )}
          </nav>
          {attempt && (
            <nav className="mt-5 flex flex-wrap gap-2 xl:flex-col xl:items-start" aria-label="Filter by your answers">
              <h2 className="eyebrow w-full">Yours</h2>
              {([['Everything', undefined], ['I got these wrong', 'wrong'], ['I never reached these', 'missed']] as const).map(
                ([label, value]) => (
                  <FilterLink key={label} label={label}
                              href={hrefFor(testId, { filter: value, section: sectionFilter })}
                              active={(value ?? undefined) === filter} />
                ),
              )}
            </nav>
          )}
        </div>

        <div className="min-w-0 max-w-4xl">
          {!attempt && (
            <p className="rounded-control border border-line bg-surface px-5 py-4 text-sm text-ink-soft">
              You did not sit this paper, so there is nothing of yours to compare. The questions and
              solutions are all here.
            </p>
          )}

          {paper.sections.filter((s) => !sectionFilter || s.code === sectionFilter).map((section) => {
            const visible = section.questions.filter((q) => keep(q.number, q.answer))
            if (!visible.length) return null
            return (
              <section key={section.code} className="mt-6 first:mt-0">
                <h2 className="text-lg font-black">{sectionName(pattern, section.code as SectionCode)}</h2>
                <ol className="mt-3 space-y-4">
                  {visible.map((question) => {
                    const block = section.directions?.find(
                      (b) => question.number >= b.from && question.number <= b.to,
                    )
                    const r = mine.get(question.number)
                    return (
                      <li key={question.number} className="card p-5">
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
                              <span className="numeral">Your time {clock(r.timeSpentSec)}</span>
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
        </div>
      </div>
    </main>
    </AppShell>
  )
}

function hrefFor(testId: string, q: { filter?: string; section?: string }): string {
  const params = new URLSearchParams()
  if (q.section) params.set('section', q.section)
  if (q.filter) params.set('filter', q.filter)
  const qs = params.toString()
  return qs ? `/archive/${testId}?${qs}` : `/archive/${testId}`
}

function FilterLink({ label, href, active, shape }: {
  label: string; href: string; active: boolean
  /** A section's own answer colour, so the rail names sections the way the
      paper does rather than as four identical pills. */
  shape?: number
}) {
  const dot = shape === undefined ? null : ['var(--color-opt-red)', 'var(--color-opt-blue)',
    'var(--color-opt-yellow)', 'var(--color-opt-green)'][shape % 4]
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition',
        active ? 'bg-surface-invert text-white' : 'bg-surface text-ink-soft hover:bg-surface-sunken',
      ].join(' ')}
    >
      {dot && (
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: dot }} />
      )}
      {label}
    </Link>
  )
}

/** Seconds as m:ss. */
function clock(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
