import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { PATTERN, SECTION_CODES, SECTION_NAMES, TOTAL_MINUTES, TOTAL_QUESTIONS } from '../../../lib/types'
import { formatIstDate, formatIstTime, WINDOW } from '../../../lib/time'
import { beginAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The pre-test briefing (FR-6.3.1).
 *
 * Everything that will surprise someone mid-test is stated here first: the
 * one-way section rule, that unused time is lost, and exactly what the
 * full-screen policy does and does not do.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()

  const { test: testId } = await searchParams
  if (!testId) redirect('/dashboard')

  const { data: test } = await db()
    .from('tests').select('id, date, title, status').eq('id', testId).maybeSingle()
  if (!test) redirect('/dashboard')

  const isDryRun = user.role === 'admin'

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href={isDryRun ? '/admin/papers' : '/dashboard'} className="text-sm font-bold text-play-purple">
        &larr; Back
      </Link>

      <h1 className="mt-4 text-4xl font-black tracking-tight">{test.title ?? 'Daily mock'}</h1>
      <p className="mt-1 text-ink-soft">{formatIstDate(test.date as string)}</p>

      {isDryRun && (
        <p className="mt-4 rounded-2xl bg-play-yellow/20 px-5 py-4 text-sm font-semibold">
          This is a dry run. It uses the real engine and the real timers, but it is never counted
          and never appears on the leaderboard.
        </p>
      )}

      <section className="mt-6 rounded-3xl bg-white p-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">The pattern</h2>
        <ul className="mt-3 space-y-1.5">
          {SECTION_CODES.map((code, i) => (
            <li key={code} className="flex items-baseline justify-between gap-4 text-sm">
              <span><span className="mr-2 font-mono text-ink-soft">{i + 1}.</span>{SECTION_NAMES[code]}</span>
              <span className="tabular-nums text-ink-soft">
                {PATTERN[code].questions} q &middot; {PATTERN[code].minutes} min
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-black/10 pt-3 font-semibold tabular-nums">
          {TOTAL_QUESTIONS} questions &middot; {TOTAL_MINUTES} minutes &middot; +1 correct, &minus;0.25 wrong,
          0 unattempted
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Before you begin</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          <li><strong>Sections run in order and only forward.</strong> Once you leave a section you cannot return to it.</li>
          <li><strong>Each section has its own timer.</strong> Finishing early does not add time to the next one.</li>
          <li><strong>Full screen is required.</strong> Your browser will always let you leave it with Esc; if you do, the question is covered until you return, the count is recorded and shown on your result, and <strong>your timer keeps running</strong>. It never ends your test.</li>
          <li><strong>Two numbers are recorded:</strong> how many times you left full screen, and how many times you switched away. Nothing else.</li>
          <li><strong>Your timer starts the moment you press Begin</strong>, not when this page opened.</li>
        </ul>
      </section>

      <form action={beginAction} className="mt-6">
        <input type="hidden" name="testId" value={String(test.id)} />
        <button className="w-full rounded-2xl bg-play-purple px-8 py-5 text-xl font-black text-white transition hover:bg-play-purple-deep">
          Begin
        </button>
      </form>
      <p className="mt-3 text-center text-sm text-ink-soft">
        Entry closes at {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.
      </p>
    </main>
  )
}
