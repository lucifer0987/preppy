import Link from 'next/link'
import { getAttemptsByTest, isCounted } from '../../../lib/repo/attempt-admin'
import { requireAdmin } from '../../../lib/guard'
import { canStartAttempt, formatIstDate, paperLabels } from '../../../lib/time'
import { clearAttemptAction, voidAttemptAction } from './actions'
import { ConfirmButton } from './ConfirmButton'
import { db } from '../../../lib/supabase/admin'
import { Empty, PageHeader, Flash, StatusChip, TableShell, Th } from '../../../components/Page'
import { TrackSwitcher } from '../../../components/TrackSwitcher'
import { PaperRankList } from '../../../components/PaperRankList'
import { getPaperStandings } from '../../../lib/repo/leaderboard'
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

  /**
   * When one paper is being looked at, its rank list above the table.
   *
   * The table below is every attempt in the order they were sat, which answers
   * "who has handed in" and not "how did it go". Both are wanted, and the
   * second is one glance rather than nine columns read down.
   *
   * No viewer id: on the console an admin sees every paper's standings, closed
   * or not. A failed read must not take the page down -- the attempts are the
   * point of the screen and the ranking is an addition to it.
   */
  const standings = test
    ? await getPaperStandings(test).catch((e: Error) => {
        console.error('[admin/attempts] standings', e.message)
        return null
      })
    : null
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

      {standings && standings.rows.length > 0 && (
        <section className="card mt-4 p-5">
          <PaperRankList standings={standings} meUserId="" top={10}
                         heading="Top 10 on this paper" />
          <p className="mt-3 text-xs text-ink-faint">
            By score alone, equal scores sharing a place. Voided attempts are not on it.
            Every attempt, in the order they were sat, is in the table below.
          </p>
        </section>
      )}

      {error && <Flash tone="bad" className="mt-4">{error}</Flash>}
      {done && (
        <Flash tone="good" className="mt-4">
          {done === 'cleared'
            ? 'Cleared. Their answers are gone and they can sit it again while entry is open.'
            : 'Voided. It no longer counts on the leaderboard.'}
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
                    // Clearing the row frees the slot, but a student can only
                    // use it while entry is still open on this paper.
                    const retakeable = canStartAttempt(group.window)
                    const labels = paperLabels(group.window)
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
                          <span className="flex flex-wrap items-center justify-end gap-2">
                            {/* The row is nine numbers; this is the page the
                                student actually reads. Offered for a finished
                                attempt of any kind, voided ones included --
                                "what did they see?" is asked most often about
                                exactly those. */}
                            {a.state !== 'IN_PROGRESS' && (
                              <Link href={`/test/${a.id}/done`}
                                    className="btn btn-quiet px-4 py-2 text-sm">
                                See their result
                              </Link>
                            )}
                            {isCounted(a) && (
                              <ConfirmButton action={voidAttemptAction} fields={{ attemptId: a.id, back }}
                                             label="Void" confirm="Take it off the leaderboard for good?" />
                            )}
                            {/* Voiding keeps the row, and the row is what holds
                                the one-attempt-per-paper slot -- so "it does not
                                count" and "have another go" needed separate
                                buttons. This is the second. The label says which
                                of the two it actually is here: with entry closed
                                there is no again to have, and offering one would
                                be a lie told by a button. */}
                            <ConfirmButton
                              action={clearAttemptAction}
                              fields={{ attemptId: a.id, back }}
                              label={retakeable ? 'Allow retake' : 'Delete attempt'}
                              confirm={retakeable
                                ? `Delete ${a.displayName}'s answers and score so they can sit it again before ${labels.closes}? This cannot be undone.`
                                : `Entry closed at ${labels.closes}, so they cannot sit it again. Delete their answers and score anyway? This cannot be undone.`}
                            />
                          </span>
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

      {/* Three facts about this screen. The two sentences that used to sit in
          the middle explained why integrity logging is two integers, which is
          a design decision and belongs in the reference, not under a table an
          admin reads every day. */}
      <p className="mt-6 text-sm text-ink-soft">
        Your own dry runs are not listed: they count for nothing and each one replaces the last.
        The two counters say <em>that</em> something happened, never when or for how long.
        Voiding an attempt takes it off the leaderboard and keeps the row.
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
