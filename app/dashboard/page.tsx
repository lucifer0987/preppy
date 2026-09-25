import { redirect } from 'next/navigation'
import { currentUser } from '../../lib/auth'
import { logoutAction } from '../login/actions'
import { formatIstDate, formatIstTime, liveTestDate, nextOpenAt, WINDOW } from '../../lib/time'
import { Countdown } from '../../components/Countdown'

/**
 * Three panels: tonight's test, the archive, the leaderboard (PRD section 6.3).
 * Phase 0 puts the shell and the clock in place; Phase 1 fills the panels.
 */
/**
 * Authenticated and live-data backed: never prerender it.
 */
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const user = await currentUser()
  if (!user) redirect('/login')

  const live = liveTestDate()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Preppy</p>
          <h1 className="text-3xl font-black tracking-tight">Hello, {user.displayName}</h1>
        </div>
        <div className="flex items-center gap-4">
          {user.role === 'admin' && (
            <a href="/admin" className="text-sm font-bold text-play-purple underline">Admin</a>
          )}
          <form action={logoutAction}>
            <button className="text-sm font-bold text-ink-soft underline">Log out</button>
          </form>
        </div>
      </header>

      {user.mustChangePassword && (
        <p className="mt-6 rounded-2xl bg-play-yellow/15 px-5 py-4 text-sm font-semibold">
          Your admin set this password. Changing it is coming in the next phase.
        </p>
      )}

      {/* Panel 1 */}
      <section className="mt-8 rounded-3xl bg-play-purple p-6 text-white">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
          {live ? "Tonight's paper" : 'Next paper'}
        </h2>
        {live ? (
          <>
            <p className="mt-2 text-2xl font-black">{formatIstDate(live)}</p>
            <p className="mt-1 text-white/70">
              The test engine arrives in Phase 1. The window is open now.
            </p>
          </>
        ) : (
          <>
            <div className="mt-3"><Countdown targetIso={nextOpenAt().toISOString()} /></div>
            <p className="mt-4 text-sm text-white/70">
              Unlocks at {formatIstTime(WINDOW.openHour, WINDOW.openMinute)}. Last entry{' '}
              {formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.
            </p>
          </>
        )}
      </section>

      {/* Panels 2 and 3 */}
      <Placeholder title="Past papers" body="Every paper you have taken, with full answers and solutions after midnight." />
      <Placeholder title="Leaderboard" body="Cumulative points across every paper, carried forward." />
    </main>
  )
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-4 rounded-3xl border-2 border-dashed border-black/10 p-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">{title}</h2>
      <p className="mt-2 text-ink-soft">{body}</p>
      <p className="mt-2 text-xs font-bold uppercase tracking-widest text-ink-soft/60">Phase 1</p>
    </section>
  )
}
