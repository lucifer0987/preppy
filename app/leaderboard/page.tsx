import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '../../lib/auth'
import { getLeaderboard } from '../../lib/repo/leaderboard'
import { LeaderboardTable } from '../../components/LeaderboardTable'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { window: win } = await searchParams
  const lastN = win === '30' ? 30 : win === '7' ? 7 : undefined
  const rows = await getLeaderboard(lastN ? { lastN } : {})

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm font-bold text-play-purple">&larr; Dashboard</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-ink-soft">
        Cumulative points across every paper. It never resets.
      </p>

      <nav className="mt-5 flex gap-2" aria-label="Window">
        {[['All time', undefined], ['Last 7', '7'], ['Last 30', '30']].map(([label, value]) => {
          const active = (value ?? undefined) === win || (!value && !win)
          return (
            <Link
              key={label as string}
              href={value ? `/leaderboard?window=${value}` : '/leaderboard'}
              className={[
                'rounded-full px-4 py-2 text-sm font-bold transition',
                active ? 'bg-play-purple text-white' : 'bg-white text-ink-soft hover:bg-black/5',
              ].join(' ')}
            >
              {label as string}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6">
        <LeaderboardTable rows={rows} meUserId={user.id} />
      </div>

      {user.role === 'admin' && (
        <p className="mt-6 rounded-2xl bg-play-yellow/15 px-5 py-4 text-sm">
          You do not appear here. Admin attempts are always dry runs, so they are never counted.
        </p>
      )}
    </main>
  )
}
