import Link from 'next/link'
import { formatIstDate } from '../lib/time'

/**
 * The leaderboard's filters: a window in papers, or one paper's own rank list.
 *
 * Shared, because the console grew its own copy of the board and two copies of
 * a filter row drift -- the student's gains a range the admin's does not, and
 * the two screens quietly stop answering the same question.
 *
 * Counted in papers rather than days: a day may hold more than one, so the
 * label says which.
 */
export function BoardFilters({ basePath, window: win, test, papers }: {
  /** '/leaderboard' or '/admin/board'. Both take the same two parameters. */
  basePath: string
  window: string | undefined
  test: string | undefined
  papers: { id: string; date: string; title: string | null }[]
}) {
  return (
    <div className="card mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
      <nav className="flex flex-wrap gap-1" aria-label="Window">
        {([['All time', undefined], ['Last 7 papers', '7'], ['Last 30 papers', '30']] as const)
          .map(([label, value]) => {
            const current = !test && (value ?? undefined) === win
            return (
              <Link
                key={label}
                href={value ? `${basePath}?window=${value}` : basePath}
                aria-current={current ? 'page' : undefined}
                className={[
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  current
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
      </nav>

      {papers.length > 0 && (
        <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
          <label htmlFor="paper" className="text-sm font-bold text-ink-soft">One paper</label>
          <select
            id="paper" name="test" defaultValue={test ?? ''}
            className="field select-field w-auto rounded-full py-1.5 text-sm font-semibold"
          >
            <option value="" disabled>Choose&hellip;</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {formatIstDate(p.date)}{p.title ? ` · ${p.title}` : ''}
              </option>
            ))}
          </select>
          <button className="pill-brand px-4 py-1.5 text-sm">Show</button>
          {test && (
            <Link href={basePath} className="text-sm font-semibold text-ink-soft underline underline-offset-4">
              Back to all time
            </Link>
          )}
        </form>
      )}
    </div>
  )
}
