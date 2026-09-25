import Link from 'next/link'
import { requireUser } from '../../lib/guard'
import { db } from '../../lib/supabase/admin'
import { findAttempt } from '../../lib/repo/attempts'
import { logoutAction } from '../login/actions'
import {
  canStartAttempt, formatIstDate, formatIstTime, istDate, liveTestDate, nextOpenAt, WINDOW,
} from '../../lib/time'
import { Countdown } from '../../components/Countdown'
import { SoundToggle } from '../../components/SoundToggle'

export const dynamic = 'force-dynamic'

/**
 * Three panels: tonight's paper, the archive, the leaderboard (PRD 6.3).
 * The archive and leaderboard arrive in the next slices.
 */
export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const { password } = await searchParams

  const live = liveTestDate()
  const today = istDate()

  const { data: tonight } = await db()
    .from('tests').select('id, date, title, status').eq('date', today).eq('status', 'SCHEDULED').maybeSingle()

  const attempt = tonight ? await findAttempt(tonight.id as string, user.id, false) : null
  const canStart = Boolean(tonight) && live === today && canStartAttempt(today)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Preppy</p>
          <h1 className="text-3xl font-black tracking-tight">Hello, {user.displayName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SoundToggle compact />
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
          {tonight && live === today ? "Tonight's paper" : 'Next paper'}
        </h2>

        {attempt && attempt.state === 'IN_PROGRESS' ? (
          <>
            <p className="mt-2 text-2xl font-black">You are part way through</p>
            <Link href={`/test/${attempt.id}`}
                  className="mt-4 inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
              Resume test
            </Link>
          </>
        ) : attempt ? (
          <>
            <p className="mt-2 text-4xl font-black tabular-nums">{Number(attempt.total_score ?? 0).toFixed(2)}</p>
            <p className="mt-1 text-white/70">
              Submitted. Answers unlock at midnight.
            </p>
            <Link href={`/test/${attempt.id}/done`}
                  className="mt-4 inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
              See your result
            </Link>
          </>
        ) : canStart && tonight ? (
          <>
            <p className="mt-2 text-2xl font-black">{tonight.title ?? formatIstDate(today)}</p>
            <p className="mt-1 text-white/70">
              55 questions, 45 minutes. Entry closes at{' '}
              {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.
            </p>
            <Link href={`/test/start?test=${tonight.id}`}
                  className="mt-4 inline-block rounded-2xl bg-white px-7 py-3.5 font-black text-play-purple">
              Start test
            </Link>
          </>
        ) : tonight && live === today ? (
          <>
            <p className="mt-2 text-2xl font-black">
              Entry closed at {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}
            </p>
            <div className="mt-4"><Countdown targetIso={nextOpenAt().toISOString()} /></div>
          </>
        ) : (
          <>
            {!tonight && (
              <p className="mt-2 text-lg font-bold text-white/80">No paper scheduled for tonight.</p>
            )}
            <div className="mt-3"><Countdown targetIso={nextOpenAt().toISOString()} /></div>
            <p className="mt-4 text-sm text-white/70">
              Unlocks at {formatIstTime(WINDOW.openHour, WINDOW.openMinute)}. Last entry{' '}
              {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.
            </p>
          </>
        )}
      </section>

      <Panel
        href="/archive"
        title="Past papers"
        body="Every paper that has closed, with full answers and solutions. Filter to the ones you got wrong or never reached."
      />
      <Panel
        href="/leaderboard"
        title="Leaderboard"
        body="Cumulative points across every paper, carried forward. It never resets."
      />
    </main>
  )
}

function Panel({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="mt-4 block rounded-3xl bg-white p-6 transition hover:bg-black/[0.03]"
    >
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">{title}</h2>
      <p className="mt-2 text-ink-soft">{body}</p>
      <p className="mt-3 text-sm font-bold text-play-purple">Open &rarr;</p>
    </Link>
  )
}
