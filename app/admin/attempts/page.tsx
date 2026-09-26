import Link from 'next/link'
import { getAttemptsByTest, isCounted } from '../../../lib/repo/attempt-admin'
import { requireAdmin } from '../../../lib/guard'
import { formatIstDate } from '../../../lib/time'
import { deleteDryRunAction, voidAttemptAction } from './actions'
import { ConfirmButton } from './ConfirmButton'
import { db } from '../../../lib/supabase/admin'
import { BackLink, PageHeader, Flash } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function AttemptsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { test, user, error, done } = await searchParams
  const groups = await getAttemptsByTest({ testId: test, userId: user })
  const { data: person } = user
    ? await db().from('profiles').select('display_name, username').eq('id', user).maybeSingle()
    : { data: null }
  const back = `/admin/attempts${user ? `?user=${user}` : test ? `?test=${test}` : ''}`

  return (
    <>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        title={person ? `${person.display_name}\u2019s attempts` : 'Attempts'}
        lede="Score, duration and the two integrity counters. Nothing else is recorded."
        actions={(user || test)
          ? <Link href="/admin/attempts" className="btn btn-quiet">Show everyone</Link>
          : undefined}
      />

      {error && <Flash tone="bad" className="mt-4">{error}</Flash>}
      {done && (
        <Flash tone="good" className="mt-4">
          {done === 'voided' ? 'Voided. It no longer counts on the leaderboard.' : 'Dry run deleted.'}
        </Flash>
      )}

      {groups.length === 0 ? (
        <p className="mt-8 rounded-card border border-dashed border-line-strong p-8 text-center text-ink-soft">
          Nobody has sat a paper yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.testId} className="mt-8">
            <h2 className="text-lg font-black">
              {formatIstDate(group.date)}
              <span className="ml-2 text-sm font-semibold text-ink-soft">
                {group.title ?? 'Daily mock'} &middot; {group.attempts.filter(isCounted).length} counted
              </span>
            </h2>

            <div className="mt-3 overflow-x-auto card p-5">
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
                      <tr key={a.id} className={`border-t border-line ${a.state === 'VOIDED' ? 'opacity-50' : ''}`}>
                        <td className="py-2.5 pr-3">
                          <Link href={`/admin/attempts?user=${a.userId}`} className="font-semibold hover:underline">{a.displayName}</Link>
                          {a.isDryRun && (
                            <span className="ml-2 rounded-full bg-surface-sunken border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                              dry run
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold">
                          {a.totalScore === null ? '—' : a.totalScore.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-good-ink">{a.correct ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">{a.attempted ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">{a.notReached ?? '—'}</td>
                        <td className="py-2.5 px-2 text-right text-ink-soft">
                          {a.timeSpentSec === null ? '—' : `${Math.round(a.timeSpentSec / 60)}m`}
                        </td>
                        <td className={`py-2.5 px-2 text-right ${noisy ? 'font-bold text-bad-ink' : 'text-ink-soft'}`}>
                          {a.fullscreenExits}
                        </td>
                        <td className={`py-2.5 px-2 text-right ${noisy ? 'font-bold text-bad-ink' : 'text-ink-soft'}`}>
                          {a.tabSwitches}
                        </td>
                        <td className="py-2.5 pr-3 text-ink-soft">{describe(a.state)}</td>
                        <td className="py-2.5 text-right">
                          {isCounted(a) && (
                            <ConfirmButton action={voidAttemptAction} fields={{ attemptId: a.id, back }}
                                           label="Void" confirm="Take it off the leaderboard for good?" />
                          )}
                          {a.isDryRun && a.state !== 'IN_PROGRESS' && (
                            <ConfirmButton action={deleteDryRunAction} fields={{ attemptId: a.id, back }}
                                           label="Delete" confirm="Delete this dry run?" />
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
