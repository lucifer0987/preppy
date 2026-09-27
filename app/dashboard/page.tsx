import Link from 'next/link'
import { AppShell } from '../../components/AppShell'
import { requireUser } from '../../lib/guard'
import { findAttempt, loadAttempt } from '../../lib/repo/attempts'
import { getArchive, getLeaderboard } from '../../lib/repo/leaderboard'
import { ordinal } from '../../lib/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import {
  canStartAttempt, defaultPaperWindow, entryClosesAt, formatIstDate, istDate, istParts, opensAt,
  paperClosed, paperLabels, type PaperWindow,
} from '../../lib/time'
import { getWindow } from '../../lib/repo/settings'
import { upcomingPapers } from '../../lib/repo/papers'
import { Countdown } from '../../components/Countdown'
import { StreakBadge } from '../../components/StreakBadge'
import { Flash } from '../../components/Page'

export const dynamic = 'force-dynamic'

type Attempt = NonNullable<Awaited<ReturnType<typeof findAttempt>>>

/**
 * Three panels: tonight's paper, the archive, the leaderboard (PRD 6.3).
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

  const now = new Date()
  const nowIso = now.toISOString()
  const today = istDate(now)
  // A day can hold more than one paper, so this is whichever is open now and
  // whichever opens next, rather than a lookup by date.
  const { live: openPaper, next: nextPaper } = await upcomingPapers(now)
  const tonight = openPaper ? { id: openPaper.id, date: openPaper.window.date, title: openPaper.title } : null
  const labels = paperLabels(openPaper?.window ?? nextPaper?.window ?? defaultPaperWindow(today, await getWindow()))
  const live = Boolean(openPaper)

  let attempt: Attempt | null = tonight ? await findAttempt(tonight.id as string, user.id, false) : null
  let remainingSec = 0
  if (attempt?.state === 'IN_PROGRESS') {
    // loadAttempt rolls forward any section that ran out while nobody was
    // looking, and scores the attempt if that finished it, so what shows here
    // agrees with what the test page would say.
    const snapshot = await loadAttempt(attempt.id as string)
    if (snapshot?.status.finished) attempt = await findAttempt(tonight!.id as string, user.id, false)
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
  const afterTonight = live && (doneWithLive || (!attempt && !entryStillOpen)) ? nextPaper : null

  // Panels 2 and 3. Either failing must not take the whole dashboard down:
  // tonight's paper is the panel that matters once the window opens.
  const [board, archive] = await Promise.all([
    getLeaderboard().catch((e: Error) => { console.error('[dashboard] board', e.message); return null }),
    getArchive(user.id).catch((e: Error) => { console.error('[dashboard] archive', e.message); return null }),
  ])
  const mine = board?.find((r) => r.userId === user.id)

  return (
    <AppShell user={user} current="dashboard">
    <main className="shell pt-6">
      <header>
        <p className="eyebrow">{greeting(now)}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">{user.displayName}</h1>
      </header>

      {password === 'changed' && (
        <Flash tone="good" className="mt-6">
          Password changed.
        </Flash>
      )}

      <section className="relative mt-6 overflow-hidden rounded-card bg-surface-invert p-6 text-white
                          shadow-high sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06]"
               style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        </div>
        <div className="relative max-w-3xl">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
          {live || attempt ? "Tonight's paper" : 'Next paper'}
        </h2>

        {attempt && attempt.state === 'IN_PROGRESS' ? (
          <>
            <p className="mt-2 text-2xl font-black">You are part way through</p>
            <p className="mt-1 text-white/70">Time left in this section:</p>
            <div className="mt-3">
              <Countdown
                targetIso={new Date(now.getTime() + remainingSec * 1000).toISOString()}
                nowIso={nowIso} label="Time left in this section"
              />
            </div>
            <Link href={`/test/${attempt.id}`}
                  className="btn btn-zap mt-4 px-7 py-3.5">
              Resume test
            </Link>
          </>
        ) : attempt && attempt.state === 'VOIDED' ? (
          <>
            <p className="mt-2 text-2xl font-black">Your attempt was voided</p>
            <p className="mt-1 text-white/70">
              The admin set it aside, so it does not count and has no score. Ask them if you are not
              sure why.
            </p>
            {afterTonight && <NextPaper paper={afterTonight} nowIso={nowIso} />}
          </>
        ) : attempt && tonight ? (
          <>
            <p className="mt-2 text-4xl font-black tabular-nums">{Number(attempt.total_score ?? 0).toFixed(2)}</p>
            <p className="mt-1 text-sm font-semibold text-white/80">
              Your rank appears when this paper closes at {labels.hardStop} and the leaderboard takes it in.
            </p>
            <p className="mt-1 text-white/70">
              {attempt.state === 'AUTO_SUBMITTED' ? 'Submitted when time ran out. ' : 'Submitted. '}
              {paperClosed(openPaper!.window, now)
                ? 'Answers and solutions are open now.'
                : `Answers unlock at ${labels.hardStop}.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/test/${attempt.id}/done`}
                    className="btn btn-invert inline-block px-7 py-3.5">
                See your result
              </Link>
              {paperClosed(openPaper!.window, now) && (
                <Link href={`/archive/${tonight.id}`}
                      className="inline-block rounded-control bg-white/15 px-7 py-3.5 font-black text-white">
                  Review answers
                </Link>
              )}
            </div>
            {afterTonight && <NextPaper paper={afterTonight} nowIso={nowIso} />}
          </>
        ) : live && tonight && openPaper && canStartAttempt(openPaper.window, now) ? (
          <>
            <p className="mt-2 text-2xl font-black">{tonight.title ?? 'Daily mock'}</p>
            <p className="mt-1 text-white/70">{formatIstDate(today)}</p>
            <p className="mt-3 text-sm font-semibold tabular-nums">
              {openPaper.shape.questions} questions &middot; {openPaper.shape.minutes} minutes
              {openPaper.shape.marking
                ? <> &middot; +{openPaper.shape.marking.correct} correct, &minus;{openPaper.shape.marking.negative} wrong</>
                : <> &middot; marking varies by section</>}
            </p>
            <p className="mt-4 text-sm text-white/70">
              Time left to enter (entry closes at{' '}
              {labels.closes}):
            </p>
            <div className="mt-2">
              <Countdown targetIso={entryClosesAt(openPaper!.window).toISOString()} nowIso={nowIso} label="Entry closes in" />
            </div>
            <Link href={`/test/start?test=${tonight.id}`}
                  className="btn btn-zap mt-4 px-7 py-3.5">
              Start test
            </Link>
          </>
        ) : live ? (
          <>
            <p className="mt-2 text-2xl font-black">
              Entry closed at {labels.closes}
            </p>
            <NextPaper paper={afterTonight} nowIso={nowIso} />
          </>
        ) : (
          <>
            {!tonight && <p className="mt-2 text-lg font-bold text-white/80">No test tonight.</p>}
            <NextPaper paper={upcoming} nowIso={nowIso} />
            {mine && mine.currentStreak > 0 && (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Your streak <StreakBadge days={mine.currentStreak} size="lg" />
                {mine.longestStreak > mine.currentStreak && (
                  <span className="text-white/70">Longest: {mine.longestStreak} in a row</span>
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
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="card p-6" aria-labelledby="archive-panel">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="archive-panel" className="eyebrow">Past papers</h2>
          <Link href="/archive" className="text-sm font-bold text-accent">All papers &rarr;</Link>
        </div>
        {archive === null ? (
          <p className="mt-3 text-sm text-ink-soft">Past papers could not be loaded just now.</p>
        ) : archive.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No paper has closed yet. Each one opens here at midnight.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {archive.slice(0, 5).map((a) => (
              <li key={a.testId}>
                <Link href={`/archive/${a.testId}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:text-accent">
                  <span className="font-bold">{formatIstDate(a.date)}</span>
                  <span className="ml-auto flex items-center gap-3 tabular-nums">
                    {a.attemptId ? (
                      <>
                        <span className="rounded-full bg-answered px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">Attempted</span>
                        <span className="font-bold">{a.score?.toFixed(2)}</span>
                        <span className="text-ink-soft">{a.rank !== null ? `${ordinal(a.rank)} of ${a.cohortSize}` : 'rank when it closes'}</span>
                      </>
                    ) : (
                      <span className="rounded-full bg-surface-sunken border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">Not attempted</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6" aria-labelledby="board-panel">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 id="board-panel" className="eyebrow">Leaderboard</h2>
          <Link href="/leaderboard" className="text-sm font-bold text-accent">Filters and podium &rarr;</Link>
        </div>
        <div className="mt-3">
          {board === null
            ? <p className="card p-6 text-sm text-ink-soft">The leaderboard could not be loaded just now.</p>
            : <LeaderboardTable rows={board} meUserId={user.id} compact />}
        </div>
      </section>
      </div>
    </main>
    </AppShell>
  )
}

/** A countdown to the next scheduled paper, or a plain statement that there is none. */
function NextPaper({ paper, nowIso }: {
  paper: { title: string | null; window: PaperWindow } | null; nowIso: string
}) {
  if (!paper) {
    return (
      <p className="mt-3 text-white/70">
        No paper is scheduled yet. Check back later; a night without one never breaks your streak.
      </p>
    )
  }
  return (
    <>
      <p className="mt-3 text-sm text-white/70">
          Next paper: {formatIstDate(paper.window.date)} at {paperLabels(paper.window).opens}
        </p>
      <div className="mt-2"><Countdown targetIso={opensAt(paper.window).toISOString()} nowIso={nowIso} /></div>
    </>
  )
}



/** Morning, afternoon or evening in IST -- the page already knows the instant. */
function greeting(at: Date): string {
  const h = istParts(at).hour
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
