'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The admin console's navigation.
 *
 * There wasn't any. The header held a wordmark and a logout button, so getting
 * from Attempts to People meant going back to the console home and picking a
 * tile -- every time. The home page's tiles still exist, because a grid with a
 * sentence under each name is the better way in the first time; this is the
 * faster way in every time after that.
 *
 * A client component only because it needs the current path to mark the active
 * tab; it holds no state of its own.
 */
const TABS = [
  { href: '/admin', label: 'Today' },
  { href: '/admin/papers', label: 'Papers' },
  { href: '/admin/users', label: 'People' },
  { href: '/admin/attempts', label: 'Attempts' },
  { href: '/admin/pattern', label: 'Pattern' },
  { href: '/admin/window', label: 'Window' },
] as const

export function AdminNav({ variant }: { variant: 'bar' | 'row' }) {
  const path = usePathname()

  return (
    <nav
      aria-label="Admin"
      className={variant === 'bar'
        ? 'hidden items-center gap-1 lg:flex'
        // On a phone the tabs sit under the mark and scroll sideways, the same
        // shape the student shell uses, so the two consoles feel related.
        : 'shell flex gap-1 overflow-x-auto border-t border-line py-1.5 lg:hidden'}
    >
      {TABS.map(({ href, label }) => {
        // /admin matches only itself; the rest match their own subtree, so the
        // paper detail screen still shows Papers as current.
        const active = href === '/admin' ? path === '/admin' : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
              active
                ? 'bg-accent-soft text-accent'
                : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
