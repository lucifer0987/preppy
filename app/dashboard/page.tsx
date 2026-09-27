import Link from 'next/link'
import { AppShell } from '../../components/AppShell'
import { requireUser } from '../../lib/guard'
import { findAttempt, loadAttempt } from '../../lib/repo/attempts'
import { DEFAULT_BOARD_PAPERS, getArchive, getLeaderboard } from '../../lib/repo/leaderboard'
import { ordinal } from '../../lib/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import {
  canStartAttempt, defaultPaperWindow, entryClosesAt, formatIstDate, hardStopAt, istDate, istParts,
  opensAt, paperClosed, paperLabels, type PaperWindow,
} from '../../lib/time'
import { getWindow } from '../../lib/repo/settings'
import { upcomingPapers } from '../../lib/repo/papers'
import { viewerTrack } from '../../lib/repo/tracks'
import { Countdown } from '../../components/Countdown'
import { StreakBadge } from '../../components/StreakBadge'
import { Flash } from '../../components/Page'

export const dynamic = 'force-dynamic'

type Attempt = NonNullable<Awaited<ReturnType<typeof findAttempt>>>

/**
 * Three panels: the paper that is open, the archive, the leaderboard (PRD 6.3).
 *
 * Panel 1 follows the 6.3 table row by row. Every branch is decided from the
 * clock and the attempt's own state on read, and every countdown refreshes the
 * page when it reaches zero, so the panel flips at the configured open and
 * entry-close times without anyone reloading.
 */
export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const { password } = await searchParams
  // Everything on this page is about one exam: the student's own. An admin
  // looking at the student view has none, and is shown the first track.
  const track = await viewerTrack(user)

  const now = new Date()
  const nowIso = now.toISOString()
  const today = istDate(now)
  // A day can hold more than one paper, so this is whichever is open now and
  // whichever opens next, rather than a lookup by date.
  const { live: openPaper, next: nextPaper } = await upcomingPapers(now, track?.id)
  // Whichever paper is open right now -- papers carry their own windows, so
  // this is not "tonight's" and has not been for a while.
  const openNow = openPaper ? { id: openPaper.id, date: openPaper.window.date, title: openPaper.title } : null
  const labels = paperLabels(openPaper?.window ?? nextPaper?.window ?? defaultPaperWindow(today, await getWindow()))
  const live = Boolean(openPaper)

  let attempt: Attempt | null = openNow ? await findAttempt(openNow.id as string, user.id, false) : null
  let remainingSec = 0
  if (attempt?.state === 'IN_PROGRESS') {
    // loadAttempt rolls forward any section that ran out while nobody was
    // looking, and scores the attempt if that finished it, so what shows here
    // agrees with what the test page would say.
    const snapshot = await loadAttempt(attempt.id as string)
    if (snapshot?.status.finished) attempt = await findAttempt(openNow!.id as string, user.id, false)
    else remainingSec = snapshot?.status.remainingSec ?? 0
  }

  // Rows of 6.3 that point at a later paper need the next one actually
  // scheduled, not merely the next opening time.
  const upcoming = live || attempt ? null : nextPaper
  // A day can hold several papers, so "you are done" is not the end of the
  // evening. Point at the next one as soon as there is nothing left to do with
  // this one -- whether they sat it, or entry closed without them.
  const doneWithLive = Boolean(attempt && attempt.state !== 'IN_PROGRESS')
  const entryStillOpen = Boolean(openPaper && canStartAttempt(openPaper.window, now))
  const afterThis = live && (doneWithLive || (!attempt && !entryStillOpen)) ? nextPaper : null

  // The hero panel is full width; its text was capped at max-w-3xl, so half of
  // it sat empty on any laptop. The two states that have a clock and a button
  // put them in a column of their own, which is also the better reading order:
  // what the paper is on the left, what to do about it on the right.
  // The right-hand column: one clock and, where there is something to do, one
  // button. Which clock is the whole of this decision, and the rule is "the
  // next thing that happens to you" -- your section running out, entry
  // closing, your answers unlocking, or the next paper opening. A dashboard
  // with no clock on it is the state this panel should almost never be in.
  const nextOpen = nextPaper ? opensAt(nextPaper.window).toISOString() : null
  const heroAside: {
    label: string; targetIso: string; countdownLabel: string
    href?: string; cta?: string
  } | null =
    attempt && attempt.state === 'IN_PROGRESS'
      ? {
          label: 'Time left in this section',
          targetIso: new Date(now.getTime() + remainingSec * 1000).toISOString(),
          countdownLabel: 'Time left in this section',
          href: `/test/${attempt.id}`,
          cta: 'Resume test',
        }
      // `!attempt` matters: entry staying open is about the paper, not about
      // this student, and without it the panel went on offering "Start test"
      // to somebody who had already handed the paper in.
      : openPaper && entryStillOpen && !attempt
        ? {
            label: `Entry closes at ${labels.closes}`,
            targetIso: entryClosesAt(openPaper.window).toISOString(),
            countdownLabel: 'Entry closes in',
            href: `/test/start?test=${openPaper.id}`,
            cta: 'Start test',
          }
        // Handed this one in. The next paper is what happens to them next, so
        // it gets the clock; the result is still one press away.
        : attempt && attempt.state !== 'IN_PROGRESS' && nextOpen && nextPaper
          ? {
              label: `Next paper opens at ${paperLabels(nextPaper.window).opens}`,
              targetIso: nextOpen,
              countdownLabel: 'Next paper opens in',
              href: `/test/${attempt.id}/done`,
              cta: 'See your result',
            }
          // Nothing after it. The answers are already theirs, so the clock
          // that is left is the one their rank settles on: the last attempt
          // on this paper has to end before the figures stop moving.
          : attempt && openPaper && !paperClosed(openPaper.window, now)
            ? {
                label: `Your rank settles at ${labels.hardStop}`,
                targetIso: hardStopAt(openPaper.window).toISOString(),
                countdownLabel: 'Your rank settles in',
                href: `/test/${attempt.id}/done`,
                cta: 'See your result',
              }
            // Nothing of theirs is running: the next paper, however far off.
            // It used to be hidden past a day and a half, which is exactly
            // when a countdown is the friendliest thing on the page.
            : nextOpen && nextPaper
              ? {
                  label: `Next paper opens at ${paperLabels(nextPaper.window).opens}`,
                  targetIso: nextOpen,
                  countdownLabel: 'Next paper opens in',
                  ...(attempt ? { href: `/test/${attempt.id}/done`, cta: 'See your result' } : {}),
                }
              : null

  // Panels 2 and 3. Either failing must not take the whole dashboard down:
  // the open paper is the panel that matters once its window opens.
  const [board, archive] = await Promise.all([
    // The same window the full board opens on, so the panel and the page it
    // links to never disagree about who is first.
    track
      ? getLeaderboard(track.id, { lastN: DEFAULT_BOARD_PAPERS })
          .catch((e: Error) => { console.error('[dashboard] board', e.message); return null })
      : Promise.resolve(null),
    track
      ? getArchive(user.id, track.id)
          .catch((e: Error) => { console.error('[dashboard] archive', e.message); return null })
      : Promise.resolve(null),
  ])
  const mine = board?.rows.find((r) => r.userId === user.id)

  return (
    <AppShell user={user} current="dashboard" examName={track?.name}>
    <main className="shell pt-6">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-ink-soft">{greeting(now)},</span> {user.displayName}
        </h1>
      </header>

      {password === 'changed' && (
        <Flash tone="good" className="mt-6">
          Password changed.
        </Flash>
      )}

      <section className="relative mt-4 overflow-hidden rounded-card bg-surface-invert p-5 text-white shadow-high sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-zap-600/30 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06]"
               style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0 max-w-xl">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
          {live || attempt ? "Today's paper" : 'Next paper'}
        </h2>

        {attempt && attempt.state === 'IN_PROGRESS' ? (
          <>
            <p className="mt-2 text-2xl font-black">You are part way through</p>
            <p className="mt-1 text-white/70">
              Your section timer has been running since you started, so pick up where you
              left off.
            </p>
          </>
        ) : attempt && attempt.state === 'VOIDED' ? (
          <>
            <p className="mt-2 text-2xl font-black">Your attempt was voided</p>
            <p className="mt-1 text-white/70">
              The admin set it aside, so it does not count and has no score. Ask them if you are not
              sure why.
            </p>
            {afterThis && <NextPaper paper={afterThis} />}
          </>
        ) : attempt && openNow ? (
          <>
            <p className="mt-2 text-4xl font-black tabular-nums">{Number(attempt.total_score ?? 0).toFixed(2)}</p>
            <p className="mt-1 text-white/70">
              {attempt.state === 'AUTO_SUBMITTED' ? 'Submitted when time ran out. ' : 'Submitted. '}
              Your answers, your rank and the board are open now.
              {!paperClosed(openPaper!.window, now) && (
                <> Entry stays open until {labels.closes}, so your rank can still move.</>
              )}
            </p>
            {/* Both from the moment they hand in. The countdown column carries
                "See your result" when it has a clock to show; this row is
                where Review answers lives either way. */}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/archive/${openNow.id}`}
                    className="btn btn-invert inline-block px-7 py-3.5">
                Review answers
              </Link>
              {!heroAside && (
                <Link href={`/test/${attempt.id}/done`}
                      className="btn btn-invert inline-block bg-white/15 px-7 py-3.5 text-white">
                  See your result
                </Link>
              )}
            </div>
            {afterThis && <NextPaper paper={afterThis} />}
          </>
        ) : live && openNow && openPaper && canStartAttempt(openPaper.window, now) ? (
          <>
            <p className="mt-2 text-2xl font-black">{openNow.title ?? 'Daily mock'}</p>
            <p className="mt-1 text-white/70">{formatIstDate(today)}</p>
            <p className="mt-3 text-sm font-semibold tabular-nums">
              {openPaper.shape.questions} questions &middot; {openPaper.shape.minutes} minutes
              {openPaper.shape.marking
                ? <> &middot; +{openPaper.shape.marking.correct} correct, &minus;{openPaper.shape.marking.negative} wrong</>
                : <> &middot; marking varies by section</>}
            </p>
          </>
        ) : live ? (
          <>
            <p className="mt-2 text-2xl font-black">
              Entry closed at {labels.closes}
            </p>
            <p className="mt-1 text-white/70">
              You did not start today&rsquo;s paper. Its answers open to everyone once it closes.
            </p>
            <NextPaper paper={afterThis} />
          </>
        ) : (
          <>
            {!openNow && <p className="mt-1.5 font-display text-2xl font-black">Nothing open right now.</p>}
            <NextPaper paper={upcoming} />
            {mine && mine.currentStreak > 0 && (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Your streak <StreakBadge papers={mine.currentStreak} size="lg" />
                {mine.longestStreak > mine.currentStreak && (
                  <span className="text-white/70">Longest: {mine.longestStreak} papers in a row</span>
                )}
              </p>
            )}
            {upcoming && (
              <p className="mt-4 text-sm text-white/70">
                Unlocks at {labels.opens}. Last entry{' '}
                {labels.closes}.
              </p>
            )}
          </>
        )}
        </div>

        {heroAside && (
          <div className="w-full shrink-0 sm:w-auto">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">
              {heroAside.label}
            </p>
            <div className="mt-2">
              <Countdown targetIso={heroAside.targetIso} nowIso={nowIso}
                         label={heroAside.countdownLabel} />
            </div>
            {/* Not every clock has something to press: a paper four days
                out is worth counting down to and cannot be started. */}
            {heroAside.href && heroAside.cta && (
              <Link href={heroAside.href} className="btn btn-zap mt-4 w-full px-7 py-3.5">
                {heroAside.cta}
              </Link>
            )}
          </div>
        )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="card p-5" aria-labelledby="archive-panel">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="archive-panel" className="eyebrow">Past papers</h2>
          <Link href="/archive" className="text-sm font-bold text-accent">All papers &rarr;</Link>
        </div>
        {archive === null ? (
          <p className="mt-3 text-sm text-ink-soft">Past papers would not load. Nothing is lost. Try again in a moment.</p>
        ) : archive.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing here yet. Hand a paper in and it turns up here. Papers you skip appear once they close.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {archive.slice(0, 5).map((a) => (
              <li key={a.testId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{a.title ?? 'Daily mock'}</span>
                  <span className="numeral mt-0.5 block text-xs text-ink-faint">
                    {formatIstDate(a.date)}
                  </span>
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  {a.attemptId ? (
                    <>
                      <span className="font-bold">{a.score?.toFixed(2)}</span>
                      <span className="text-ink-soft">
                        {ordinal(a.rank ?? 1)} of {a.cohortSize}{a.settled ? '' : ' so far'}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5
                                     text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                      Not attempted
                    </span>
                  )}
                </span>
                {/* The same three actions the full list offers, sized for a
                    digest. A row-wide link could only ever mean one of them,
                    and the digest offering fewer than the list was a reason to
                    leave the digest -- which is not what a digest is for. */}
                <span className="flex items-center gap-1.5">
                  {a.attemptId && (
                    <Link href={`/test/${a.attemptId}/done`}
                          className="btn btn-quiet px-3 py-1 text-xs">
                      See result
                    </Link>
                  )}
                  {/* Students only: an admin's attempts are dry runs already,
                      so practice is a thing they cannot meaningfully do. */}
                  {user.role === 'student' && (
                    <Link href={`/test/start?test=${a.testId}&practice=1`}
                          className="btn btn-quiet px-3 py-1 text-xs">
                      Practise
                    </Link>
                  )}
                  <Link href={`/archive/${a.testId}`} className="btn btn-quiet px-3 py-1 text-xs">
                    Solutions
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5" aria-labelledby="board-panel">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 id="board-panel" className="eyebrow">
            Leaderboard <span className="font-normal normal-case tracking-normal text-ink-faint">
              &middot; last {DEFAULT_BOARD_PAPERS} papers</span>
          </h2>
          <Link href="/leaderboard" className="text-sm font-bold text-accent">Full board &rarr;</Link>
        </div>
        <div className="mt-3">
          {board === null
            ? <p className="card p-6 text-sm text-ink-soft">The board would not load. Your scores are safe; try again in a moment.</p>
            : <LeaderboardTable rows={board.rows} maxMarks={board.maxMarks} meUserId={user.id} compact />}
        </div>
      </section>
      </div>
    </main>
    </AppShell>
  )
}

/** A countdown to the next scheduled paper, or a plain statement that there is none. */
/**
 * The line about what comes next. The clock for it lives in the column on the
 * right, which is where every clock on this panel lives, so this says the
 * thing a clock cannot: which paper, and when.
 */
function NextPaper({ paper }: { paper: { title: string | null; window: PaperWindow } | null }) {
  if (!paper) {
    return (
      <p className="mt-3 text-white/70">
        No paper is scheduled yet. A day without one breaks nobody&rsquo;s streak.
      </p>
    )
  }
  return (
    <p className="mt-3 text-sm text-white/70">
      Next: <span className="font-semibold text-white">{paper.title ?? 'Daily mock'}</span>
      {' '}&middot; {formatIstDate(paper.window.date)} at {paperLabels(paper.window).opens}
    </p>
  )
}



/** Morning, afternoon or evening in IST -- the page already knows the instant. */
function greeting(at: Date): string {
  const h = istParts(at).hour
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
