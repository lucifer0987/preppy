import { formatIstDate } from '../lib/time'
import { ordinal } from '../lib/leaderboard'
import type { PaperStandingRow } from '../lib/repo/leaderboard'
import { Empty, TableShell, Th } from './Page'

/**
 * One paper's own rank list: by score alone (FR-3.3), equal scores sharing a
 * place. Shared by the student's board and the console's.
 *
 * `meUserId` is empty on the console, where nobody is "you": an admin's
 * attempts are dry runs and are counted nowhere.
 */
export function PaperRankList({ standings, meUserId }: {
  standings: { date: string; rows: PaperStandingRow[] } | null
  meUserId: string
}) {
  if (!standings) {
    return (
      <Empty>
        That paper is not open to you yet. Hand it in and its rank list appears. Once entry
        closes, everybody sees it.
      </Empty>
    )
  }
  if (!standings.rows.length) {
    return <Empty>Nobody sat the paper for {formatIstDate(standings.date)}.</Empty>
  }
  return (
    <div>
      {/* Outside the scroll container: inside it, the date slid out of view
          with the table. */}
      <h2 className="eyebrow">{formatIstDate(standings.date)}</h2>
      <div className="mt-3">
        <TableShell minWidth="26rem">
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <Th className="pl-4">#</Th>
              <Th>Student</Th>
              <Th align="right">Score</Th>
              <Th align="right" className="pr-4">Accuracy</Th>
            </tr>
          </thead>
          <tbody className="numeral">
            {standings.rows.map((row) => {
              const me = row.userId === meUserId
              return (
                <tr key={row.userId}
                    className={`border-b border-line last:border-0 ${me ? 'bg-accent-soft font-semibold' : ''}`}>
                  <td className="py-3 pl-4 pr-3 font-bold">{ordinal(row.rank)}</td>
                  <td className="px-3 py-3 font-display">
                    {row.displayName}
                    {me && (
                      <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[0.5625rem]
                                       font-bold uppercase tracking-widest text-white align-middle">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-bold">{row.score.toFixed(2)}</td>
                  <td className="px-3 py-3 pr-4 text-right text-ink-soft">
                    {row.accuracyPct === null ? '—' : `${row.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      </div>
    </div>
  )
}
