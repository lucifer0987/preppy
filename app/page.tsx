import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Countdown } from '../components/Countdown'
import { ThemeToggle } from '../components/ThemeToggle'
import { currentUser } from '../lib/auth'
import { isConfigured } from '../lib/env'
import { SECTION_NAMES, patternTotals, uniformMarking } from '../lib/types'
import { Wordmark } from '../components/Wordmark'
import { entryClosesAt, formatIstDate, opensAt, paperLabels, windowLabels } from '../lib/time'
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
  const { live, next } = isConfigured()
    ? await upcomingPapers(now).catch(nextUnavailable)
    : { live: null, next: null }
  // A paper that is open right now is the answer to "what happens next",
  // so it wins over the one after it. Without this a visitor arriving during
  // the window was told nothing was scheduled.
  const labels = live ? paperLabels(live.window)
    : next ? paperLabels(next.window)
    : windowLabels(testWindow, await defaultAttemptMinutes())
  // The shape a paper takes, from the configured default pattern rather than a
  // constant, so this page tells the truth after the pattern is changed.
  const pattern = await getPattern()
  const totals = patternTotals(pattern)
  const marking = uniformMarking(pattern)

  return (
    <main data-room="home" className="relative min-h-dvh overflow-hidden bg-page text-ink">
      {/* Texture, not decoration: two soft lights and a fine grid so the page
          has somewhere to recede to. The grid is drawn in currentColor so it
          is dark dots on the light theme and light dots on the dark one --
          a fixed white grid was invisible on white. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-56 h-[42rem] w-[42rem] rounded-full bg-brand-400/25 blur-3xl" />
        <div className="absolute -bottom-64 -right-40 h-[36rem] w-[36rem] rounded-full bg-zap-400/20 blur-3xl" />
        <div className="absolute inset-0 text-ink opacity-[0.07]"
             style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '26px 26px' }} />
      </div>

      <div className="relative shell flex min-h-dvh flex-col py-5">
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center py-4 lg:py-6">
          <div className="grid w-full items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 xl:gap-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-pill border border-line-strong bg-surface
                            px-3.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-ink-soft">
                IBPS Specialist Officer &middot; IT
              </p>

              {/* No cohort size here. It said "Five of you", which was true the
                  day it was written and is a number that grows. */}
              <h1 className="mt-5 font-display text-5xl font-black leading-[1.02] tracking-tight
                             sm:text-[3.75rem] xl:text-[4.75rem]">
                One paper a day.<br />
                <span className="text-zap-ink">One board</span> that<br />
                never resets.
              </h1>

              <p className="measure mt-6 text-lg leading-relaxed text-ink-soft xl:text-xl">
                Marked and timed the way the real exam marks and times. Every paper you sit
                stays on the board, so today&rsquo;s score is still counting in March.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/login" className="btn btn-zap px-7 py-3.5 text-lg">
                  Log in
                </Link>
                <p className="text-sm text-ink-faint">
                  Your admin creates the accounts.<br className="hidden sm:inline" />
                  {' '}There is no sign-up.
                </p>
              </div>
            </div>

            {/* One card, not two stacked and not a strip along the foot: when
                the paper is scheduled and its shape sit together they read as
                one answer to "what am I in for". Every figure comes
                from the configured pattern; only the section names are fixed. */}
            <section className="card overflow-hidden" aria-labelledby="next-paper">
              <NextPaper live={live} next={next} now={now} labels={labels} totals={totals} />

              <div className="border-t border-line bg-surface-sunken px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="eyebrow">What a paper looks like</h3>
                  <p className="numeral text-xs font-bold">
                    {totals.questions} questions &middot; {totals.minutes} minutes
                  </p>
                </div>
                <ul className="mt-3 space-y-2">
                  {pattern.map((s, i) => (
                    <li key={s.code} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2.5">
                        <Shape index={i} />
                        <span className="truncate font-semibold">{SECTION_NAMES[s.code]}</span>
                      </span>
                      <span className="numeral shrink-0 text-xs text-ink-faint">
                        {s.questions} questions &middot; {s.minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
                {marking && (
                  <p className="numeral mt-3 border-t border-line pt-2.5 text-xs text-ink-faint">
                    +{marking.correct} for a right answer, &minus;{marking.negative} for a wrong one,
                    nothing for a blank.
                  </p>
                )}
              </div>
            </section>
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
function NextPaper({ live, next, now, labels, totals }: {
  live: { window: PaperWindow; title: string | null } | null
  next: { window: PaperWindow; title: string | null } | null
  now: Date
  labels: { opens: string; closes: string }
  totals: { minutes: number }
}) {
  if (live) {
    return (
      <div className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="next-paper" className="eyebrow">Open now</h2>
          <span className="numeral shrink-0 text-xs text-ink-faint">
            {formatIstDate(live.window.date)}
          </span>
        </div>
        <p className="mt-2 font-display text-2xl font-black text-good-ink">
          {live.title ?? 'Today\u2019s paper'}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Log in and start it. You get the full {totals.minutes} minutes however late you
          begin, as long as you begin before entry closes.
        </p>
        {/* A live paper has a clock too, and it is the one that matters: not
            when it opens, but how long is left to get in. */}
        <div className="mt-3.5">
          <Countdown targetIso={entryClosesAt(live.window).toISOString()} nowIso={now.toISOString()}
                     label="Entry closes in" tone="on-surface" />
        </div>
        <p className="numeral mt-3.5 border-t border-line pt-3 text-xs text-ink-faint">
          Entry closes {labels.closes}. {next
            ? <>Then {formatIstDate(next.window.date)} at {paperLabels(next.window).opens}.</>
            : null}
        </p>
      </div>
    )
  }

  if (!next) {
    return (
      <div className="p-5 sm:p-6">
        <h2 id="next-paper" className="eyebrow">Next paper</h2>
        <p className="mt-2.5 font-display text-2xl font-black">Nothing scheduled yet</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Papers go up a day at a time. The countdown appears here the moment your admin
          schedules one &mdash; and a day without a paper never breaks anyone&rsquo;s streak.
        </p>
        <p className="mt-3.5 border-t border-line pt-3 text-xs text-ink-faint">
          They usually open at {labels.opens}, with last entry {labels.closes}.
        </p>
      </div>
    )
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-paper" className="eyebrow">Next paper opens in</h2>
        <span className="numeral shrink-0 text-xs text-ink-faint">
          {formatIstDate(next.window.date)}
        </span>
      </div>
      <div className="mt-3">
        <Countdown targetIso={opensAt(next.window).toISOString()} nowIso={now.toISOString()}
                   tone="on-surface" />
      </div>
      <p className="mt-3.5 border-t border-line pt-3 text-sm text-ink-soft">
        Opens {labels.opens}. Last entry {labels.closes}, so whoever starts latest still
        gets the full {totals.minutes} minutes.
      </p>
    </div>
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
function nextUnavailable(e: Error): { live: null; next: null } {
  const missing = /schema cache|does not exist/i.test(e.message)
  console.error(
    missing
      ? '[home] The papers table is missing columns this build expects, so the countdown is ' +
        'showing the default window.\n' +
        '       Apply the pending migration:  npm run migrate'
      : `[home] Could not read the next paper: ${e.message}`,
  )
  return { live: null, next: null }
}
