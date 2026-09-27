import Link from 'next/link'
import { AdminNav } from '../../components/AdminNav'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Wordmark } from '../../components/Wordmark'
import { requireAdmin } from '../../lib/guard'
import { logoutAction } from '../login/actions'

/**
 * The admin shell.
 *
 * A rail on the left from lg up, a header with a scrolling tab row below it on
 * anything narrower. The rail is the pattern that scales past five
 * destinations, and it hands the whole width of the page to the work rather
 * than spending a band of it on chrome.
 *
 * The check here is server-side, so an admin page is never protected by the
 * obscurity of its URL alone (PRD section 13), and a logged-in student who
 * guesses /admin is sent to their dashboard. It is not the only check: a
 * layout does not re-run on every navigation and does not cover server
 * actions or route handlers, so each page calls requireAdmin and each action
 * calls actionAdmin for itself.
 */
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()

  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Link href="/admin" className="flex items-center gap-2.5" aria-label="Preppy admin">
            <Wordmark size="sm" />
          </Link>
          <span className="rounded-pill border border-line-strong px-1.5 py-0.5 text-[0.5625rem]
                           font-bold uppercase tracking-[0.14em] text-ink-faint">
            Admin
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <AdminNav variant="rail" />

          <p className="mt-5 px-3 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
            Data
          </p>
          <a href="/api/admin/export"
             className="mt-1 flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold
                        text-ink-soft transition hover:bg-surface-sunken hover:text-ink">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-70">
              <path d="M10 2a1 1 0 0 1 1 1v7.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L9 10.6V3a1 1 0 0 1 1-1zM3 15a1 1 0 0 1 2 0v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            </svg>
            Export bank
          </a>
        </div>

        <div className="shrink-0 border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-3 pb-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-accent-soft
                             font-display text-[0.6875rem] font-black text-accent">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{user.username}</span>
              <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Admin
              </span>
            </span>
          </div>

          <ThemeToggle variant="row" />

          <Link href="/account"
                className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold
                           text-ink-soft transition hover:bg-surface-sunken hover:text-ink">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-70">
              <path d="M10 1.5a4 4 0 00-4 4V8H5.5A1.5 1.5 0 004 9.5v7A1.5 1.5 0 005.5 18h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 8H14V5.5a4 4 0 00-4-4zm-2 4a2 2 0 114 0V8H8V5.5z" />
            </svg>
            Your account
          </Link>

          <Link href="/dashboard"
                className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold
                           text-ink-soft transition hover:bg-surface-sunken hover:text-ink">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-70">
              <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 17c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5v1H3z" />
            </svg>
            Student view
          </Link>

          <form action={logoutAction}>
            <button className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm
                               font-semibold text-ink-soft transition hover:bg-bad/10 hover:text-bad-ink">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-70">
                <path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V5H5v10h6v-.5a1 1 0 112 0V16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h8z"/>
                <path d="M16.3 9.3l-2.6-2.6a1 1 0 10-1.4 1.4l.9.9H9a1 1 0 100 2h4.2l-.9.9a1 1 0 101.4 1.4l2.6-2.6a1 1 0 000-1.4z"/>
              </svg>
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur
                           supports-[backdrop-filter]:bg-surface/70 lg:hidden"
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex h-14 items-center gap-3 px-4">
            <Link href="/admin" aria-label="Preppy admin"><Wordmark size="sm" /></Link>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <form action={logoutAction}>
                <button className="rounded-pill p-2 text-ink-faint transition hover:bg-surface-sunken hover:text-bad-ink"
                        aria-label="Log out" title="Log out">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                    <path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V5H5v10h6v-.5a1 1 0 112 0V16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h8z"/>
                    <path d="M16.3 9.3l-2.6-2.6a1 1 0 10-1.4 1.4l.9.9H9a1 1 0 100 2h4.2l-.9.9a1 1 0 101.4 1.4l2.6-2.6a1 1 0 000-1.4z"/>
                  </svg>
                </button>
              </form>
            </div>
          </div>
          <AdminNav variant="row" />
        </header>

        <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  )
}
