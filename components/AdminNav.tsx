'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The admin console's navigation.
 *
 * A rail rather than a row: once there are five or more destinations the
 * sidebar is the pattern that scales, and it leaves the whole width of the
 * page to the work instead of spending a band of it on tabs. The console home
 * used to repeat all six as large tiles underneath the header, which was the
 * same list said twice.
 *
 * A client component only because it needs the current path; it holds no state.
 */
const TABS = [
  { href: '/admin', label: 'Today', d: 'M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z' },
  { href: '/admin/papers', label: 'Papers', d: 'M5 2h7l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6 1.5V7h3.5z' },
  { href: '/admin/users', label: 'People', d: 'M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 16c0-2.5 2.2-4 5-4s5 1.5 5 4v1H2zm11 1v-1c0-1.4-.5-2.6-1.3-3.5.6-.2 1.3-.3 2-.3 2.4 0 4.3 1.3 4.3 3.4V17z' },
  { href: '/admin/attempts', label: 'Attempts', d: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 4v4.3l3 1.7-.8 1.4L9 11V6z' },
  { href: '/admin/board', label: 'Board', d: 'M3 12h4v6H3zm5.5-5h3v11h-3zM14 3h3v15h-3z' },
  { href: '/admin/tracks', label: 'Exams', d: 'M10 2 2 6l8 4 8-4zM2 9.5V14l8 4 8-4V9.5l-8 4z' },
  { href: '/admin/pattern', label: 'Pattern', d: 'M3 3h6v6H3zm8 0h6v6h-6zM3 11h6v6H3zm8 0h6v6h-6z' },
  { href: '/admin/window', label: 'Window', d: 'M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 4v9h12V7zM6 1.5h1.5V4H6zm6.5 0H14V4h-1.5z' },
] as const

export function AdminNav({ variant }: { variant: 'rail' | 'row' }) {
  const path = usePathname()
  const rail = variant === 'rail'

  return (
    <nav
      aria-label="Admin"
      className={rail
        ? 'flex flex-col gap-0.5'
        // On a phone the same list scrolls sideways under the header.
        : 'flex gap-1 overflow-x-auto px-4 py-1.5 lg:hidden'}
    >
      {TABS.map(({ href, label, d }) => {
        // /admin matches only itself; the rest own their subtree, so the paper
        // detail screen still shows Papers as current.
        const active = href === '/admin' ? path === '/admin' : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-2.5 whitespace-nowrap rounded-control text-sm font-semibold transition',
              rail ? 'px-3 py-2' : 'px-3 py-1.5',
              active
                ? 'bg-accent-soft text-accent'
                : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
            ].join(' ')}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"
                 className={`h-4 w-4 shrink-0 fill-current ${active ? '' : 'opacity-70'}`}>
              <path d={d} />
            </svg>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
