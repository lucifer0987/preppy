import Link from 'next/link'
import { AdminNav } from '../../components/AdminNav'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Wordmark } from '../../components/Wordmark'
import { requireAdmin } from '../../lib/guard'
import { logoutAction } from '../login/actions'

/**
 * The admin shell.
 *
 * The check here is server-side, so an admin page is never protected by the
 * obscurity of its URL alone (PRD section 13), and a logged-in student who
 * guesses /admin is sent to their dashboard. It is not the only check: a
 * layout does not re-run on every navigation and does not cover server
 * actions or route handlers, so each page calls requireAdmin and each action
 * calls actionAdmin for itself.
 */
/**
 * Authenticated and live-data backed: never prerender it.
 */
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur
                         supports-[backdrop-filter]:bg-surface/70"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="shell flex h-16 items-center gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5" aria-label="Preppy admin">
            <Wordmark size="sm" />
            <span className="hidden rounded-full border border-line-strong px-2 py-0.5 text-[0.625rem]
                             font-bold uppercase tracking-[0.14em] text-ink-faint sm:inline-block">
              Admin
            </span>
          </Link>

          <AdminNav variant="bar" />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard"
                  className="hidden rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft transition
                             hover:bg-surface-sunken hover:text-ink sm:inline-block">
              Student view
            </Link>
            <span className="hidden items-center gap-2 rounded-full bg-surface-sunken py-1 pl-1 pr-3 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft
                               font-display text-[0.625rem] font-black text-accent">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-ink">{user.username}</span>
            </span>
            <form action={logoutAction}>
              <button className="rounded-full p-2 text-ink-faint transition hover:bg-surface-sunken hover:text-bad-ink"
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

      <main className="shell py-8 sm:py-10">{children}</main>
    </div>
  )
}
