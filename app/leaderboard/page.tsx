import { AppShell } from '../../components/AppShell'
import { PageHeader, Flash } from '../../components/Page'
import { requireUser } from '../../lib/guard'
import {
  boardPapers, DEFAULT_BOARD_PAPERS, getLeaderboard, getPaperStandings,
} from '../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'
import { BoardFilters } from '../../components/BoardFilters'
import { PaperRankList } from '../../components/PaperRankList'

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

  const { window: win, test } = await searchParams
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
  try {
    ;[papers, board, standings] = await Promise.all([
      // Scoped to the papers this student may look at.
      boardPapers(user.id),
      test ? Promise.resolve({ rows: [], maxMarks: 0, papers: 0 }) : getLeaderboard(lastN ? { lastN } : {}),
      test ? getPaperStandings(test, user.id) : Promise.resolve(null),
    ])
  } catch (e) {
    failure = (e as Error).message
  }


  return (
    <AppShell user={user} current="leaderboard">
    <main className="shell pt-6">
      <PageHeader
        title="Leaderboard"
        lede="Points across the last seven papers by default, and all time if you ask for it. It takes each result in the moment it is scored."
        meta={!test && board.rows.length > 0
          ? <span className="numeral">
              {lastN ? `Last ${lastN} papers` : 'All time'} &middot; {board.rows.length} on the board
            </span>
          : undefined}
      />

      <BoardFilters basePath="/leaderboard" window={win} test={test} papers={papers} />

      <div className="mt-6">
        {failure ? (
          <Flash tone="bad">
            The board would not load. Every score is still recorded — it is the reading of
            them that failed. Try again in a moment. ({failure})
          </Flash>
        ) : test ? (
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
