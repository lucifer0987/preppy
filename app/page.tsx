import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Countdown } from '../components/Countdown'
import { ThemeToggle } from '../components/ThemeToggle'
import { currentUser } from '../lib/auth'
import { isConfigured } from '../lib/env'
import { SECTION_NAMES, patternTotals, uniformMarking } from '../lib/types'
import { opensAt, paperLabels, windowLabels } from '../lib/time'
import { defaultAttemptMinutes, getPattern, getWindow } from '../lib/repo/settings'
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
  // Decorative on this page: it turns "a paper opens at 10 PM" into a countdown
  // to the real one. A signed-out visitor is better served by the usual times
  // than by an error page, so a failure here is logged and stepped over -- the
  // dashboard, where a student needs the truth, still fails loudly.
  const { next } = isConfigured() ? await upcomingPapers(now).catch(nextUnavailable) : { next: null }
  const labels = next ? paperLabels(next.window) : windowLabels(testWindow, await defaultAttemptMinutes())
  // The shape a paper takes, from the configured default pattern rather than a
  // constant, so this page tells the truth after the pattern is changed.
  const pattern = await getPattern()
  const totals = patternTotals(pattern)
  const marking = uniformMarking(pattern)

  return (
    <main className="min-h-dvh bg-play-purple text-white">
      <div className="shell flex min-h-dvh flex-col py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-white/60 sm:text-xs">
            IBPS SO (IT) &middot; daily mock
          </p>
          <ThemeToggle tone="invert" />
        </div>

        {/* Two columns past the lg breakpoint: the pitch reads on the left while
            the two facts a visitor actually came for sit on the right. Stacked
            below that, and the facts go side by side on a tablet first, because
            they are short. */}
        <div className="flex flex-1 items-center py-10 lg:py-14">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16 xl:gap-24">
            <div>
              <h1 className="text-5xl font-black tracking-tight sm:text-6xl xl:text-7xl">Preppy</h1>
              <p className="measure mt-5 text-lg text-white/80 sm:text-xl">
                One paper a night, marked like the real exam, on a leaderboard that never resets.
              </p>
              <div className="mt-8 sm:mt-10">
                <Link href="/login" className="btn btn-invert px-8 py-4 text-lg">
                  Log in
                </Link>
                <p className="mt-3 text-sm text-white/60">
                  Accounts are issued by your admin. There is no sign-up.
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <section className="rounded-card bg-white/10 p-6" aria-labelledby="next-paper">
                <h2 id="next-paper" className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                  Next paper unlocks in
                </h2>
                <div className="mt-3">
                  <Countdown targetIso={(next ? opensAt(next.window) : new Date(now.getTime() + 86_400_000)).toISOString()} nowIso={now.toISOString()} />
                </div>
                <p className="mt-4 text-sm text-white/70">
                  Opens {labels.opens}. Last entry {labels.closes}, so everyone gets the full {totals.minutes} minutes.
                </p>
              </section>

              <section className="rounded-card bg-white/10 p-6" aria-labelledby="pattern">
                <h2 id="pattern" className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                  Tonight&rsquo;s pattern
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {pattern.map((s) => (
                    <li key={s.code} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="font-semibold">{SECTION_NAMES[s.code]}</span>
                      <span className="numeral text-white/70">
                        {s.questions} q &middot; {s.minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="numeral mt-4 border-t border-white/20 pt-3 text-sm font-semibold">
                  {totals.questions} questions &middot; {totals.minutes} minutes
                  {marking
                    ? <> &middot; +{marking.correct} correct, &minus;{marking.negative} wrong</>
                    : <> &middot; marking varies by section</>}
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

/**
 * The home page without a paper lookup. Named rather than inlined so the reason
 * stays next to the message, and so the two migration cases read the same way
 * as the settings ones.
 */
function nextUnavailable(e: Error): { next: null } {
  const missing = /schema cache|does not exist/i.test(e.message)
  console.error(
    missing
      ? '[home] The papers table is missing columns this build expects, so the countdown is ' +
        'showing the default window.\n' +
        '       Apply the pending migration:  npm run migrate'
      : `[home] Could not read the next paper: ${e.message}`,
  )
  return { next: null }
}
