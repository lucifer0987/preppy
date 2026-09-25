import Link from 'next/link'
import { requireUser } from '../../lib/guard'
import { db } from '../../lib/supabase/admin'
import { findAttempt, loadAttempt } from '../../lib/repo/attempts'
import { getArchive, getLeaderboard } from '../../lib/repo/leaderboard'
import { ordinal } from '../../lib/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import { logoutAction } from '../login/actions'
import { TOTAL_MINUTES, TOTAL_QUESTIONS } from '../../lib/types'
import {
  BOARD_REFRESH, addDays, answersUnlocked, canStartAttempt, entryClosesAt, formatIstDate, formatIstTime,
  istDate, opensAt, windowState, WINDOW,
} from '../../lib/time'
import { Countdown } from '../../components/Countdown'
import { StreakBadge } from '../../components/StreakBadge'
import { SoundToggle } from '../../components/SoundToggle'

export const dynamic = 'force-dynamic'

type Attempt = NonNullable<Awaited<ReturnType<typeof findAttempt>>>

/**
 * Three panels: tonight's paper, the archive, the leaderboard (PRD 6.3).
 *
 * Panel 1 follows the 6.3 table row by row. Every branch is decided from the
 * clock and the attempt's own state on read, and every countdown refreshes the
 * page when it reaches zero, so the panel flips at 22:00 and 23:15 unaided.
 */
export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const { password } = await searchParams

  const now = new Date()
  const nowIso = now.toISOString()
  const today = istDate(now)
  const state = windowState(today, now)

  const { data: tonight } = await db()
    .from('tests').select('id, date, title').eq('date', today).eq('status', 'SCHEDULED').maybeSingle()
  const live = Boolean(tonight) && (state === 'OPEN' || state === 'ENTRY_CLOSED')

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
  // scheduled, not merely the next 22:00.
  const upcoming = live || attempt ? null : await nextScheduled(today, state === 'BEFORE_OPEN')
  const afterTonight = live && !attempt && !canStartAttempt(today, now) ? await nextScheduled(today, false) : null

  // Panels 2 and 3. Either failing must not take the whole dashboard down:
  // tonight's paper is the panel that matters at 22:00.
  const [board, archive] = await Promise.all([
    getLeaderboard().catch((e: Error) => { console.error('[dashboard] board', e.message); return null }),
    getArchive(user.id).catch((e: Error) => { console.error('[dashboard] archive', e.message); return null }),
  ])
  const mine = board?.find((r) => r.userId === user.id)
  const refresh = formatIstTime(BOARD_REFRESH.hour, BOARD_REFRESH.minute)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Preppy</p>
          <h1 className="text-3xl font-black tracking-tight">Hello, {user.displayName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SoundToggle initial={user.soundEnabled} compact />
          {user.role === 'admin' && (
            <Link href="/admin" className="text-sm font-bold text-play-purple underline">Admin</Link>
          )}
          <Link href="/change-password" className="text-sm font-bold text-ink-soft underline">
            Password
          </Link>
          <form action={logoutAction}>
            <button className="text-sm font-bold text-ink-soft underline">Log out</button>
          </form>
        </div>
      </header>

      {password === 'changed' && (
        <p className="mt-6 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          Password changed.
        </p>
      )}

      <section className="mt-8 rounded-3xl bg-play-purple p-6 text-white">
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
                  className="mt-4 inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
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
          </>
        ) : attempt && tonight ? (
          <>
            <p className="mt-2 text-4xl font-black tabular-nums">{Number(attempt.total_score ?? 0).toFixed(2)}</p>
            <p className="mt-1 text-sm font-semibold text-white/80">
              Your rank appears at {refresh}, when the leaderboard takes in tonight&rsquo;s results.
            </p>
            <p className="mt-1 text-white/70">
              {attempt.state === 'AUTO_SUBMITTED' ? 'Submitted when time ran out. ' : 'Submitted. '}
              {answersUnlocked(tonight.date as string, now)
                ? 'Answers and solutions are open now.'
                : 'Answers unlock at midnight.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/test/${attempt.id}/done`}
                    className="inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
                See your result
              </Link>
              {answersUnlocked(tonight.date as string, now) && (
                <Link href={`/archive/${tonight.id}`}
                      className="inline-block rounded-2xl bg-white/15 px-7 py-3.5 font-black text-white">
                  Review answers
                </Link>
              )}
            </div>
          </>
        ) : live && tonight && canStartAttempt(today, now) ? (
          <>
            <p className="mt-2 text-2xl font-black">{tonight.title ?? 'Daily mock'}</p>
            <p className="mt-1 text-white/70">{formatIstDate(today)}</p>
            <p className="mt-3 text-sm font-semibold tabular-nums">
              {TOTAL_QUESTIONS} questions &middot; {TOTAL_MINUTES} minutes &middot; +1 correct, &minus;0.25 wrong
            </p>
            <p className="mt-4 text-sm text-white/70">
              Time left to enter (entry closes at{' '}
              {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}):
            </p>
            <div className="mt-2">
              <Countdown targetIso={entryClosesAt(today).toISOString()} nowIso={nowIso} label="Entry closes in" />
            </div>
            <Link href={`/test/start?test=${tonight.id}`}
                  className="mt-4 inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
              Start test
            </Link>
          </>
        ) : live ? (
          <>
            <p className="mt-2 text-2xl font-black">
              Entry closed at {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}
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
                Unlocks at {formatIstTime(WINDOW.openHour, WINDOW.openMinute)}. Last entry{' '}
                {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6" aria-labelledby="archive-panel">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="archive-panel" className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Past papers</h2>
          <Link href="/archive" className="text-sm font-bold text-play-purple">All papers &rarr;</Link>
        </div>
        {archive === null ? (
          <p className="mt-3 text-sm text-ink-soft">Past papers could not be loaded just now.</p>
        ) : archive.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No paper has closed yet. Each one opens here at midnight.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {archive.slice(0, 5).map((a) => (
              <li key={a.testId}>
                <Link href={`/archive/${a.testId}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:text-play-purple">
                  <span className="font-bold">{formatIstDate(a.date)}</span>
                  <span className="ml-auto flex items-center gap-3 tabular-nums">
                    {a.attemptId ? (
                      <>
                        <span className="rounded-full bg-answered px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">Attempted</span>
                        <span className="font-bold">{a.score?.toFixed(2)}</span>
                        <span className="text-ink-soft">{a.rank !== null ? `${ordinal(a.rank)} of ${a.cohortSize}` : `rank at ${refresh}`}</span>
                      </>
                    ) : (
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">Not attempted</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="board-panel">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 id="board-panel" className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Leaderboard</h2>
          <Link href="/leaderboard" className="text-sm font-bold text-play-purple">Filters and podium &rarr;</Link>
        </div>
        <div className="mt-3">
          {board === null
            ? <p className="rounded-3xl bg-white p-6 text-sm text-ink-soft">The leaderboard could not be loaded just now.</p>
            : <LeaderboardTable rows={board} meUserId={user.id} compact />}
        </div>
      </section>
    </main>
  )
}

/** A countdown to the next scheduled paper, or a plain statement that there is none. */
function NextPaper({ paper, nowIso }: { paper: { date: string } | null; nowIso: string }) {
  if (!paper) {
    return (
      <p className="mt-3 text-white/70">
        No paper is scheduled yet. Check back later; a night without one never breaks your streak.
      </p>
    )
  }
  return (
    <>
      <p className="mt-3 text-sm text-white/70">Next paper: {formatIstDate(paper.date)}</p>
      <div className="mt-2"><Countdown targetIso={opensAt(paper.date).toISOString()} nowIso={nowIso} /></div>
    </>
  )
}

/**
 * The first SCHEDULED paper still to open: tonight's if 22:00 has not come
 * yet (`includeToday`), otherwise the next date after today.
 */
async function nextScheduled(today: string, includeToday: boolean): Promise<{ date: string } | null> {
  const { data } = await db()
    .from('tests').select('date').eq('status', 'SCHEDULED')
    .gte('date', includeToday ? today : addDays(today, 1))
    .order('date').limit(1).maybeSingle()
  return data ? { date: data.date as string } : null
}
