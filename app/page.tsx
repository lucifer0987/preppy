import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Countdown } from '../components/Countdown'
import { ThemeToggle } from '../components/ThemeToggle'
import { currentUser } from '../lib/auth'
import { isConfigured } from '../lib/env'
import { SECTION_NAMES, patternTotals, uniformMarking } from '../lib/types'
import { Wordmark } from '../components/Wordmark'
import { formatIstDate, opensAt, paperLabels, windowLabels } from '../lib/time'
import type { PaperWindow } from '../lib/time'
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
    <main className="relative min-h-dvh overflow-hidden bg-brand-950 text-white">
      {/* Depth, not decoration. A flat fill of one violet is what made this
          page feel like a placeholder: two soft lights and a fine dot grid
          give it somewhere to recede to. All of it is aria-hidden and none of
          it sits under text. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-48 -top-56 h-[46rem] w-[46rem] rounded-full bg-brand-600/35 blur-3xl" />
        <div className="absolute -bottom-64 -right-40 h-[40rem] w-[40rem] rounded-full bg-zap-500/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.05]"
             style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '28px 28px' }} />
      </div>

      <div className="relative shell flex min-h-dvh flex-col py-6">
        <div className="flex items-center justify-between gap-4">
          <Wordmark tone="invert" />
          <ThemeToggle tone="invert" />
        </div>

        <div className="flex flex-1 items-center py-12 lg:py-16">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16 xl:gap-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-pill border border-white/20 bg-white/5
                            px-3.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/70">
                IBPS Specialist Officer &middot; IT
              </p>

              <h1 className="mt-6 font-display text-5xl font-black leading-[1.03] tracking-tight
                             sm:text-6xl xl:text-7xl">
                Five of you.<br />
                One paper<br />
                {/* Fixed, not the --zap token: this page is deep violet in both themes,
                    so a colour that flips with the theme would be measured against
                    the wrong ground. zap-400 is 5.97:1 here either way. */}
                <span className="text-zap-400">every night.</span>
              </h1>

              <p className="measure mt-6 text-lg leading-relaxed text-white/75 sm:text-xl">
                Marked the way the real exam marks, timed the way it times. The board never
                resets, so the paper you sit tonight still counts in March.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/login" className="btn btn-zap px-8 py-4 text-lg">
                  Log in
                </Link>
                <p className="text-sm text-white/55">
                  Accounts come from your admin.<br className="hidden sm:inline" />
                  {' '}No sign-up, and no crowd.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <NextPaper next={next} now={now} labels={labels} totals={totals} />

              <section className="rounded-card border border-white/12 bg-white/[0.07] p-6 backdrop-blur-sm"
                       aria-labelledby="pattern">
                <h2 id="pattern" className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/55">
                  What a paper looks like
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {pattern.map((s, i) => (
                    <li key={s.code} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="flex items-baseline gap-2.5 truncate">
                        <Shape index={i} />
                        <span className="truncate font-semibold">{SECTION_NAMES[s.code]}</span>
                      </span>
                      <span className="numeral shrink-0 text-white/60">
                        {s.questions} &middot; {s.minutes}m
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="numeral mt-4 border-t border-white/15 pt-3.5 text-sm font-bold">
                  {totals.questions} questions in {totals.minutes} minutes
                </p>
                <p className="mt-1 text-xs text-white/55">
                  {marking
                    ? <>+{marking.correct} for right, &minus;{marking.negative} for wrong, nothing for blank.</>
                    : <>Marking varies by section; nothing is taken off for a blank.</>}
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
 * The countdown, or the honest absence of one.
 *
 * This used to count down to `now + 24h` whenever there was no paper, which
 * meant a visitor was shown a confident timer to a moment nothing was going to
 * happen at. A fabricated number is worse than no number. Now the countdown
 * runs only against a real scheduled paper, and every other case -- none
 * scheduled, the lookup failed, Supabase not configured yet -- says so.
 */
function NextPaper({ next, now, labels, totals }: {
  next: { window: PaperWindow } | null
  now: Date
  labels: { opens: string; closes: string }
  totals: { minutes: number }
}) {
  if (!next) {
    return (
      <section className="rounded-card border border-white/12 bg-white/[0.07] p-6 backdrop-blur-sm"
               aria-labelledby="next-paper">
        <h2 id="next-paper" className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/55">
          Next paper
        </h2>
        <p className="mt-3 font-display text-2xl font-black">Nothing scheduled yet</p>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Papers go up a day at a time. The countdown appears here the moment your admin
          schedules one &mdash; and a night without a paper never breaks anyone&rsquo;s streak.
        </p>
        <p className="mt-4 border-t border-white/15 pt-3.5 text-xs text-white/50">
          They usually open at {labels.opens}, with last entry {labels.closes}.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-card border border-white/12 bg-white/[0.07] p-6 backdrop-blur-sm"
             aria-labelledby="next-paper">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-paper" className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/55">
          Next paper opens in
        </h2>
        <span className="numeral shrink-0 text-xs text-white/50">
          {formatIstDate(next.window.date)}
        </span>
      </div>
      <div className="mt-4">
        <Countdown targetIso={opensAt(next.window).toISOString()} nowIso={now.toISOString()} />
      </div>
      <p className="mt-4 border-t border-white/15 pt-3.5 text-sm text-white/65">
        Opens {labels.opens}. Last entry {labels.closes}, so whoever starts latest still
        gets the full {totals.minutes} minutes.
      </p>
    </section>
  )
}

/** One of the four answer shapes, as a bullet. The mark, reused as furniture. */
function Shape({ index }: { index: number }) {
  const fill = ['var(--color-opt-red)', 'var(--color-opt-blue)',
                'var(--color-opt-yellow)', 'var(--color-opt-green)'][index % 4]
  const path = [
    'M8 1.5 14.5 13.5 1.5 13.5Z',
    'M8 1 15 8 8 15 1 8Z',
    'M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5Z',
    'M2 2h12v12H2Z',
  ][index % 4]
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-2.5 w-2.5 shrink-0 self-center">
      <path d={path} fill={fill} />
    </svg>
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
