import Link from 'next/link'
import type { Track } from '../lib/repo/tracks'

/**
 * Which exam a screen is looking at.
 *
 * It renders nothing at all when there is one track, and that is the point
 * rather than an optimisation: a choice between one thing is not a choice, and
 * an install that only ever prepares for one exam should never be asked to
 * think about tracks. The whole of phase 3's track work is invisible until a
 * second one exists.
 *
 * A link per track rather than a select, because the chosen track lives in the
 * URL. A page is something people bookmark and paste to each other, and a
 * dropdown holding hidden state would make two people with the same link look
 * at different papers.
 *
 * Used by the console, and by the student leaderboard -- where `mine` marks
 * the exam that is actually theirs, since the others are ones they are only
 * looking at.
 */
export function TrackSwitcher({ tracks, current, basePath, mine, keep }: {
  tracks: Track[]
  current: Track | null
  /** The screen these links stay on, e.g. "/admin/papers". */
  basePath: string
  /** The viewer's own exam, marked so the others read as visiting. */
  mine?: string | null
  /** Query the switch should carry across, such as the board's window. */
  keep?: Record<string, string | undefined>
}) {
  if (tracks.length < 2) return null

  const carried = Object.entries(keep ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)

  return (
    <nav aria-label="Which exam"
         className="mt-4 flex flex-wrap items-center gap-1.5 rounded-pill border border-line
                    bg-surface-sunken p-1.5">
      {tracks.map((t) => {
        const on = t.id === current?.id
        return (
          <Link
            key={t.id}
            href={`${basePath}?${['track=' + t.slug, ...carried].join('&')}`}
            aria-current={on ? 'page' : undefined}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-bold transition ${
              on ? 'bg-accent text-on-brand' : 'text-ink-soft hover:bg-surface hover:text-ink'}`}
          >
            {t.name}
            {mine === t.id && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-widest opacity-70">
                yours
              </span>
            )}
            {!t.isActive && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-widest opacity-70">
                closed
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
