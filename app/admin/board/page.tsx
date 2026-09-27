import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import {
  boardPapers, DEFAULT_BOARD_PAPERS, getLeaderboard, getPaperStandings,
} from '../../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../../components/LeaderboardTable'
import { BoardFilters } from '../../../components/BoardFilters'
import { PaperRankList } from '../../../components/PaperRankList'
import { Empty, Flash, PageHeader, StatusChip } from '../../../components/Page'

export const dynamic = 'force-dynamic'

/**
 * The board, from the console.
 *
 * The same figures the students see, with the same two filters, on the screen
 * the admin already lives in. It moves through the day as people hand in. It was reachable only by leaving the console for
 * the student view, which is an odd trip to make to answer "who is actually
 * turning up" -- and the per-paper list is the one an admin wants most, since
 * it is the night-by-night view the cumulative board hides.
 *
 * An admin has no row here: their attempts are dry runs and are counted
 * nowhere, so nothing is highlighted as "you".
 */
export default async function AdminBoard({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { window: win, test } = await searchParams
  // The last seven papers unless asked otherwise: a board that never resets
  // becomes a record of who joined first, and recent form is the thing a
  // student can still do something about. All time is one press away.
  const lastN = win === 'all' ? undefined : win === '30' ? 30 : DEFAULT_BOARD_PAPERS

  let failure: string | null = null
  let board: Awaited<ReturnType<typeof getLeaderboard>> = { rows: [], maxMarks: 0, papers: 0 }
  let standings: Awaited<ReturnType<typeof getPaperStandings>> = null
  let papers: Awaited<ReturnType<typeof boardPapers>> = []
  try {
    ;[papers, board, standings] = await Promise.all([
      boardPapers(),
      test ? Promise.resolve({ rows: [], maxMarks: 0, papers: 0 }) : getLeaderboard(lastN ? { lastN } : {}),
      test ? getPaperStandings(test) : Promise.resolve(null),
    ])
  } catch (e) {
    failure = (e as Error).message
  }

  const scope = test ? 'One paper' : lastN ? `Last ${lastN} papers` : 'All time'

  return (
    <>
      <PageHeader
        compact
        title="Leaderboard"
        lede="What the students see, with every account listed. Points across the last seven papers, or every paper ever, or one on its own."
        meta={!test && board.rows.length > 0
          ? <span className="numeral">{scope} &middot; {board.rows.length} on the board</span>
          : undefined}
        actions={<StatusChip tone="done">What students see</StatusChip>}
      />

      <BoardFilters basePath="/admin/board" window={win} test={test} papers={papers} />

      <div className="mt-6">
        {failure ? (
          <Flash tone="bad">
            The board would not load. Every score is still recorded; it is the reading of
            them that failed. ({failure})
          </Flash>
        ) : test ? (
          <PaperRankList standings={standings} meUserId="" />
        ) : board.rows.length === 0 ? (
          <Empty>
            Nothing on the board yet. A paper joins it when it finishes, so the first entries
            appear once the first paper has run.
          </Empty>
        ) : (
          <LeaderboardTable rows={board.rows} maxMarks={board.maxMarks} meUserId="" />
        )}
      </div>

      <p className="measure-wide mt-5 text-sm text-ink-soft">
        A score that looks wrong is usually a key: correct it on the paper and every attempt is
        scored again on the spot.{' '}
        <Link href="/admin/attempts" className="font-bold text-accent underline underline-offset-4">
          Attempts
        </Link>{' '}
        has the per-paper figures, and can void one that should not count.
      </p>
    </>
  )
}
