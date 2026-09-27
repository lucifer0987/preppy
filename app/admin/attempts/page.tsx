import Link from 'next/link'
import { getAttemptsByTest, isCounted } from '../../../lib/repo/attempt-admin'
import { requireAdmin } from '../../../lib/guard'
import { formatIstDate } from '../../../lib/time'
import { voidAttemptAction } from './actions'
import { ConfirmButton } from './ConfirmButton'
import { db } from '../../../lib/supabase/admin'
import { Empty, PageHeader, Flash, StatusChip, TableShell, Th } from '../../../components/Page'
import { TrackSwitcher } from '../../../components/TrackSwitcher'
import { consoleTrack, listTracks } from '../../../lib/repo/tracks'

export const dynamic = 'force-dynamic'

export default async function AttemptsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { test, user, error, done, track: slug } = await searchParams
  const [tracks, track] = await Promise.all([listTracks(), consoleTrack(slug)])
  // One person's attempts are theirs wherever they were sat, so a track filter
  // on that view would hide their own history from them.
  const groups = await getAttemptsByTest({
    testId: test, userId: user, ...(user ? {} : { trackId: track?.id }),
  })
  const { data: person } = user
    ? await db().from('profiles').select('display_name, username').eq('id', user).maybeSingle()
    : { data: null }
  const back = `/admin/attempts${user ? `?user=${user}` : test ? `?test=${test}` : ''}`

  return (
    <>
      <PageHeader compact
        title={person ? `${person.display_name}\u2019s attempts` : 'Attempts'}
        lede="Score, duration and the two integrity counters. Nothing else is recorded."
        actions={(user || test)
          ? <Link href="/admin/attempts" className="btn btn-quiet">Show everyone</Link>
          : undefined}
      />

      {!user && <TrackSwitcher tracks={tracks} current={track} basePath="/admin/attempts" />}

      {error && <Flash tone="bad" className="mt-4">{error}</Flash>}
      {done && (
        <Flash tone="good" className="mt-4">
          Voided. It no longer counts on the leaderboard.
        </Flash>
      )}

      {groups.length === 0 ? (
        <div className="mt-6">
          <Empty>
            Nobody has sat a paper yet. Every finished attempt lands here the moment it is
            scored, with the two integrity counters beside it.
          </Empty>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.testId} className="mt-8">
            <h2 className="text-lg font-black">
              {formatIstDate(group.date)}
              <span className="ml-2 text-sm font-semibold text-ink-soft">
                {group.title ?? 'Daily mock'} &middot; {group.attempts.filter(isCounted).length} counted
              </span>
            </h2>

            {/* The padding used to sit inside the scroll container, so the
                right-hand gutter scrolled away and the last column ran into
                the border. TableShell keeps the frame still and scrolls only
                the table. */}
            <div className="mt-3">
              <TableShell minWidth="62rem">
                <thead>
                  <tr className="border-b border-line">
                    <Th>Student</Th>
                    <Th align="right">Score</Th>
                    <Th align="right">Right</Th>
                    <Th align="right">Tried</Th>
                    <Th align="right">Not reached</Th>
                    <Th align="right">Time</Th>
                    <Th align="right">Left fullscreen</Th>
                    <Th align="right">Switched away</Th>
                    <Th>How it ended</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="numeral">
                  {group.attempts.map((a) => {
                    const noisy = a.fullscreenExits + a.tabSwitches >= 5
                    return (
                      <tr key={a.id} className={`border-b border-line last:border-0 ${a.state === 'VOIDED' ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <Link href={`/admin/attempts?user=${a.userId}`}
                                  className="font-semibold hover:underline">{a.displayName}</Link>
                            </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {a.totalScore === null ? '—' : a.totalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-good-ink">{a.correct ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink-soft">{a.attempted ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink-soft">{a.notReached ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink-soft">
                          {a.timeSpentSec === null ? '—' : `${Math.round(a.timeSpentSec / 60)}m`}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${noisy ? 'font-bold text-bad-ink' : 'text-ink-soft'}`}>
                          {a.fullscreenExits}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${noisy ? 'font-bold text-bad-ink' : 'text-ink-soft'}`}>
                          {a.tabSwitches}
                        </td>
                        <td className="px-3 py-2.5 text-ink-soft">{describe(a.state)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {isCounted(a) && (
                            <ConfirmButton action={voidAttemptAction} fields={{ attemptId: a.id, back }}
                                           label="Void" confirm="Take it off the leaderboard for good?" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </TableShell>
            </div>
          </section>
        ))
      )}

      <p className="measure-wide mt-6 text-sm text-ink-soft">
        Your own dry runs are not listed: they count for nothing and each one replaces the last.
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
