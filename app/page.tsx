import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Countdown } from '../components/Countdown'
import { currentUser } from '../lib/auth'
import { isConfigured } from '../lib/env'
import { PATTERN, SECTION_NAMES, SECTION_CODES, TOTAL_MINUTES, TOTAL_QUESTIONS } from '../lib/types'
import { opensAt, paperLabels, windowLabels } from '../lib/time'
import { getWindow } from '../lib/repo/settings'
import { upcomingPapers } from '../lib/repo/papers'

/**
 * The only page an unauthenticated visitor sees (PRD section 6.2).
 *
 * FR-6.2.1: no leaderboard preview. With a cohort of five, an "anonymised top
 * five" would expose the entire membership to anyone who loads the URL.
 */
/**
 * Depends on the current time and on who is logged in, so it must never be
 * prerendered: a statically built countdown would target a build-time instant.
 */
export const dynamic = 'force-dynamic'

export default async function Home() {
  if (isConfigured() && (await currentUser())?.isActive) redirect('/dashboard')

  const now = new Date()
  const testWindow = await getWindow()
  // The next actual paper if one is scheduled; otherwise the usual times, so
  // the page still says when a paper would normally open.
  const { next } = isConfigured() ? await upcomingPapers(now) : { next: null }
  const labels = next ? paperLabels(next.window) : windowLabels(testWindow)

  return (
    <main className="min-h-dvh bg-play-purple text-white">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
          IBPS SO (IT) &middot; daily mock
        </p>
        <h1 className="mt-3 text-6xl font-black tracking-tight sm:text-7xl">Preppy</h1>
        <p className="mt-4 max-w-xl text-lg text-white/80">
          One paper a night, marked like the real exam, on a leaderboard that never resets.
        </p>

        <section className="mt-10 rounded-3xl bg-white/10 p-6" aria-labelledby="next-paper">
          <h2 id="next-paper" className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
            Next paper unlocks in
          </h2>
          <div className="mt-3">
            <Countdown targetIso={(next ? opensAt(next.window) : new Date(now.getTime() + 86_400_000)).toISOString()} nowIso={now.toISOString()} />
          </div>
          <p className="mt-4 text-sm text-white/70">
            Opens {labels.opens}. Last entry {labels.closes}, so everyone gets the full {TOTAL_MINUTES} minutes.
          </p>
        </section>

        <section className="mt-6 rounded-3xl bg-white/10 p-6" aria-labelledby="pattern">
          <h2 id="pattern" className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
            Tonight&rsquo;s pattern
          </h2>
          <ul className="mt-3 space-y-1.5">
            {SECTION_CODES.map((code) => (
              <li key={code} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-semibold">{SECTION_NAMES[code]}</span>
                <span className="tabular-nums text-white/70">
                  {PATTERN[code].questions} q &middot; {PATTERN[code].minutes} min
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-white/20 pt-3 text-sm font-semibold tabular-nums">
            {TOTAL_QUESTIONS} questions &middot; {TOTAL_MINUTES} minutes &middot; +1 correct, &minus;0.25 wrong
          </p>
        </section>

        <div className="mt-10">
          <Link
            href="/login"
            className="inline-block rounded-2xl bg-white px-8 py-4 text-lg font-black text-play-purple transition hover:bg-white/90"
          >
            Log in
          </Link>
          <p className="mt-3 text-sm text-white/60">
            Accounts are issued by your admin. There is no sign-up.
          </p>
        </div>
      </div>
    </main>
  )
}
