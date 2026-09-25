import type { LeaderboardRow } from '../lib/leaderboard'

/**
 * The only surface that shows one student anything about another (FR-5.3),
 * and it shows exactly these columns.
 */
export function LeaderboardTable({ rows, meUserId }: { rows: LeaderboardRow[]; meUserId: string }) {
  if (!rows.length) {
    return (
      <p className="rounded-3xl border-2 border-dashed border-black/15 p-8 text-center text-ink-soft">
        Nothing yet. The board fills in once the first paper closes at midnight.
      </p>
    )
  }

  const podium = rows.slice(0, 3)

  return (
    <>
      <ol className="grid gap-3 sm:grid-cols-3">
        {podium.map((row) => (
          <li
            key={row.userId}
            className={[
              'rounded-3xl p-5 text-center',
              row.rank === 1 ? 'bg-play-purple text-white sm:order-2 sm:scale-105'
                : row.rank === 2 ? 'bg-white sm:order-1'
                : 'bg-white sm:order-3',
            ].join(' ')}
          >
            <p className={`text-4xl font-black ${row.rank === 1 ? '' : 'text-ink-soft'}`}>
              {row.rank === 1 ? '1st' : row.rank === 2 ? '2nd' : '3rd'}
            </p>
            <p className="mt-1 font-bold">{row.displayName}</p>
            <p className={`text-2xl font-black tabular-nums ${row.rank === 1 ? '' : 'text-play-purple'}`}>
              {row.totalPoints.toFixed(2)}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 overflow-x-auto rounded-3xl bg-white p-5">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
              <th className="py-2 pr-2 font-bold">#</th>
              <th className="py-2 pr-2 font-bold" aria-label="Movement" />
              <th className="py-2 pr-3 font-bold">Student</th>
              <th className="py-2 px-2 text-right font-bold">Total</th>
              <th className="py-2 px-2 text-right font-bold">Papers</th>
              <th className="py-2 px-2 text-right font-bold">Avg</th>
              <th className="py-2 px-2 text-right font-bold">Accuracy</th>
              <th className="py-2 px-2 text-right font-bold">Best</th>
              <th className="py-2 pl-2 text-right font-bold">Streak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const me = row.userId === meUserId
              return (
                <tr
                  key={row.userId}
                  className={`border-t border-black/10 ${me ? 'bg-play-purple/10 font-semibold' : ''}`}
                >
                  <td className="py-2.5 pr-2 font-bold">{row.rank}</td>
                  <td className="py-2.5 pr-2">
                    <Movement value={row.movement} />
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.displayName}
                    {me && <span className="ml-2 text-[10px] uppercase tracking-widest text-play-purple">you</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-bold">{row.totalPoints.toFixed(2)}</td>
                  <td className="py-2.5 px-2 text-right text-ink-soft">{row.testsTaken}</td>
                  <td className="py-2.5 px-2 text-right text-ink-soft">{row.avgScore.toFixed(1)}</td>
                  <td className="py-2.5 px-2 text-right text-ink-soft">
                    {row.accuracyPct === null ? '—' : `${row.accuracyPct.toFixed(0)}%`}
                  </td>
                  <td className="py-2.5 px-2 text-right text-ink-soft">{row.bestScore.toFixed(2)}</td>
                  <td className="py-2.5 pl-2 text-right">
                    {row.currentStreak > 0 ? `${row.currentStreak}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Movement({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] uppercase tracking-widest text-ink-soft">new</span>
  if (value === 0) return <span className="text-ink-soft">—</span>
  const up = value > 0
  return (
    <span className={up ? 'text-answered' : 'text-notanswered'} aria-label={`${up ? 'up' : 'down'} ${Math.abs(value)}`}>
      {up ? '▲' : '▼'}{Math.abs(value)}
    </span>
  )
}
