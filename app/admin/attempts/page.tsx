import Link from 'next/link'
import { getAttemptsByTest } from '../../../lib/repo/attempt-admin'
import { formatIstDate } from '../../../lib/time'
import { voidAttemptAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AttemptsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const { test } = await searchParams
  const groups = await getAttemptsByTest(test)

  return (
    <>
      <Link href="/admin" className="text-sm font-bold text-play-purple">&larr; Admin</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Attempts</h1>
      <p className="mt-1 text-ink-soft">
        Score, duration and the two integrity counters. Nothing else is recorded.
      </p>

      {groups.length === 0 ? (
        <p className="mt-8 rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
          Nobody has sat a paper yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.testId} className="mt-8">
            <h2 className="text-lg font-black">
              {formatIstDate(group.date)}
              <span className="ml-2 text-sm font-semibold text-ink-soft">
                {group.title ?? 'Daily mock'} &middot; {group.attempts.filter((a) => !a.isDryRun).length} counted
              </span>
            </h2>

            <div className="mt-3 overflow-x-auto rounded-3xl bg-white p-5">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
                    <th className="py-2 pr-3 font-bold">Student</th>
                    <th className="py-2 px-2 text-right font-bold">Score</th>
                    <th className="py-2 px-2 text-right font-bold">Right</th>
                    <th className="py-2 px-2 text-right font-bold">Tried</th>
                    <th className="py-2 px-2 text-right font-bold">Not reached</th>
                    <th className="py-2 px-2 text-right font-bold">Time</th>
                    <th className="py-2 px-2 text-right font-bold" title="Left full screen">FS</th>
                    <th className="py-2 px-2 text-right font-bold" title="Switched away">Tab</th>
                    <th className="py-2 pr-3 font-bold">How it ended</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {group.attempts.map((a) => {
                    const noisy = a.fullscreenExits + a.tabSwitches >= 5
                    return (
                      <tr key={a.id} className={`border-t border-black/10 ${a.state === 'VOIDED' ? 'opacity-50' : ''}`}>
                        <td className="py-2.5 pr-3">
                          <span className="font-semibold">{a.displayName}</span>
                          {a.isDryRun && (
                            <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                              dry run
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold">
                          {a.totalScore === null ? '—' : a.totalScore.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-answered">{a.correct ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">{a.attempted ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">{a.notReached ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">
                          {a.timeSpentSec === null ? '—' : `${Math.round(a.timeSpentSec / 60)}m`}
                        </td>
                        <td className={`py-2.5 px-2 text-right ${noisy ? 'font-bold text-notanswered' : 'text-ink-soft'}`}>
                          {a.fullscreenExits}
                        </td>
                        <td className={`py-2.5 px-2 text-right ${noisy ? 'font-bold text-notanswered' : 'text-ink-soft'}`}>
                          {a.tabSwitches}
                        </td>
                        <td className="py-2.5 pr-3 text-ink-soft">{describe(a.state)}</td>
                        <td className="py-2.5 text-right">
                          {a.state !== 'VOIDED' && !a.isDryRun && (
                            <form action={voidAttemptAction}>
                              <input type="hidden" name="attemptId" value={a.id} />
                              <button className="text-xs font-bold text-notanswered underline">Void</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <p className="mt-6 max-w-2xl text-sm text-ink-soft">
        The two counters tell you <em>that</em> something happened, never when or for how long.
        That was the trade made when integrity logging was cut to two integers: the counter deters,
        and there is no event log to keep or to purge. Voiding an attempt removes it from the
        leaderboard but keeps the row.
      </p>
    </>
  )
}

function describe(state: string): string {
  switch (state) {
    case 'SUBMITTED': return 'Ended it themselves'
    case 'AUTO_SUBMITTED': return 'Timer ran out'
    case 'IN_PROGRESS': return 'Still open'
    case 'VOIDED': return 'Voided'
    default: return state
  }
}
