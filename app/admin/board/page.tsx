import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { getLeaderboard } from '../../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../../components/LeaderboardTable'
import { Empty, PageHeader, StatusChip } from '../../../components/Page'

export const dynamic = 'force-dynamic'

/**
 * The board, from the console.
 *
 * The same figures the students see, on the screen the admin already lives in.
 * It was reachable only by leaving the console for the student view, which is
 * an odd trip to make to answer "who is actually turning up".
 *
 * An admin has no row here -- their attempts are dry runs and are counted
 * nowhere -- so nothing is highlighted as "you".
 */
export default async function AdminBoard() {
  await requireAdmin()

  let rows: Awaited<ReturnType<typeof getLeaderboard>> = []
  let failure: string | null = null
  try {
    rows = await getLeaderboard()
  } catch (e) {
    failure = (e as Error).message
  }

  const papers = rows.reduce((n, r) => Math.max(n, r.testsTaken), 0)

  return (
    <>
      <PageHeader
        compact
        title="Leaderboard"
        lede="Cumulative points across every paper that has closed. It never resets, and a paper joins it the moment that paper finishes."
        meta={rows.length > 0
          ? <span className="numeral">{rows.length} on the board &middot; {papers} paper{papers === 1 ? '' : 's'} counted</span>
          : undefined}
        actions={<StatusChip tone="done">What students see</StatusChip>}
      />

      {failure ? (
        <p role="alert" className="mt-6 rounded-card border border-bad/30 bg-bad/10 p-5 font-semibold text-bad-ink">
          The board would not load.
          <span className="mt-1 block text-sm font-normal text-ink-soft">{failure}</span>
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-6">
          <Empty>
            Nothing on the board yet. A paper joins it when it finishes, so the first entries
            appear the night after the first paper runs.
          </Empty>
        </div>
      ) : (
        <div className="mt-6">
          <LeaderboardTable rows={rows} meUserId="" />
        </div>
      )}

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
