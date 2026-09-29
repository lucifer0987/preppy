import { AppShell } from '../../components/AppShell'
import { PageHeader, Flash } from '../../components/Page'
import { requireUser } from '../../lib/guard'
import {
  boardPapers, DEFAULT_BOARD_PAPERS, getLeaderboard, getPaperStandings,
} from '../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import { BoardFilters } from '../../components/BoardFilters'
import { PaperRankList } from '../../components/PaperRankList'
import { listTracks, viewerTrack } from '../../lib/repo/tracks'
import { TrackSwitcher } from '../../components/TrackSwitcher'

export const dynamic = 'force-dynamic'

/**
 * The leaderboard (PRD 6.7): the last seven papers by default, a wider window
 * or all time on request, or one paper's own rank list. A result joins it the
 * moment it is scored, so the board moves through the day as people hand in.
 */
export default async function LeaderboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const mine = await viewerTrack(user)

  const { window: win, test, track: slug } = await searchParams
  // Which exam's board is on screen. Theirs by default; any of them if they
  // ask, because a board is names and scores and nothing else.
  //
  // This is not the cross-exam hole that was closed in the audit, and the
  // difference is worth being exact about. A board never *mixes* two exams --
  // that would rank people against papers they were never offered, and it is
  // still impossible. Paper content is still locked to your own exam: the
  // archive, the images, sitting one, practicing one. What is allowed here is
  // looking at another exam's scoreboard, which gives away no question, no
  // key and no solution.
  const tracks = await listTracks()
  const viewed = (slug ? tracks.find((t) => t.slug === slug) : null) ?? mine
  // The last seven papers unless asked otherwise: a board that never resets
  // becomes a record of who joined first, and recent form is the thing a
  // student can still do something about. All time is one press away.
  const lastN = win === 'all' ? undefined : win === '30' ? 30 : DEFAULT_BOARD_PAPERS

  // A failed read must say so. Rendering it as an empty board would tell
  // everyone the history had been wiped.
  let failure: string | null = null
  let board: Awaited<ReturnType<typeof getLeaderboard>> = { rows: [], maxMarks: 0, papers: 0 }
  let standings: Awaited<ReturnType<typeof getPaperStandings>> = null
  let papers: Awaited<ReturnType<typeof boardPapers>> = []
  /** The paper actually being shown: `?test=` only when it is one of theirs. */
  let asked: string | undefined
  try {
    // Scoped to the papers this student may look at: their own exam's, and of
    // those only the ones they have finished or that have closed.
    // Rebuilt for whichever exam is being viewed, which is what keeps the
    // guard below correct: on somebody else's exam this student has finished
    // nothing, so the list is that exam's *closed* papers and no others.
    papers = viewed ? await boardPapers(viewed.id, user.id) : []
    // `?test=` comes out of the URL, so it is checked against that list rather
    // than trusted. Without this, one id was enough to read the rank list of a
    // paper on another exam entirely -- names and scores of people this
    // student shares nothing with (FR-5.3, FR-6.10.5). The dropdown is not a
    // security boundary; it only decides what is easy to find.
    asked = test && papers.some((p) => p.id === test) ? test : undefined
    ;[board, standings] = await Promise.all([
      asked || !viewed
        ? Promise.resolve({ rows: [], maxMarks: 0, papers: 0 })
        : getLeaderboard(viewed.id, lastN ? { lastN } : {}),
      asked ? getPaperStandings(asked, user.id) : Promise.resolve(null),
    ])
  } catch (e) {
    failure = (e as Error).message
  }


  // The footer names the exam this student is preparing for, which is theirs
  // whichever board they happen to be reading.
  return (
    <AppShell user={user} current="leaderboard" examName={mine?.name}>
    <main className="shell pt-6">
      <PageHeader
        title="Leaderboard"
        lede={viewed && mine && viewed.id !== mine.id
          ? `${viewed.name}. You are not on this board \u2014 it is another exam's \u2014 so nothing here counts towards yours.`
          : 'Points across the last seven papers, or every paper ever, or one on its own. A result joins the board the moment it is scored.'}
        meta={!asked && board.rows.length > 0
          ? <span className="numeral">
              {lastN ? `Last ${lastN} papers` : 'All time'} &middot; {board.rows.length} on the board
            </span>
          : undefined}
      />

      <TrackSwitcher tracks={tracks} current={viewed} basePath="/leaderboard"
                     mine={mine?.id} keep={{ window: win }} />

      <BoardFilters basePath="/leaderboard" window={win} test={asked} papers={papers}
                    track={tracks.length > 1 ? viewed?.slug : undefined} />

      <div className="mt-6">
        {failure ? (
          <Flash tone="bad">
            The board would not load. Every score is still recorded; it is the reading of
            them that failed. Try again in a moment. ({failure})
          </Flash>
        ) : asked ? (
          <PaperRankList standings={standings} meUserId={user.id} />
        ) : (
          <LeaderboardTable rows={board.rows} maxMarks={board.maxMarks} meUserId={user.id} />
        )}
      </div>

      {user.role === 'admin' && (
        <p className="mt-6 rounded-control bg-play-yellow/15 px-5 py-4 text-sm">
          You do not appear here. Admin attempts are always dry runs, so they are never counted.
        </p>
      )}
    </main>
    </AppShell>
  )
}
