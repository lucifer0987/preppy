import Link from 'next/link'
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
    <div className="min-h-dvh">
      <header className="border-b-2 border-black/10 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-6 py-4">
          <Link href="/admin" className="text-lg font-black tracking-tight">
            Preppy <span className="text-play-purple">admin</span>
          </Link>
          <span className="rounded-full bg-play-purple px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            {user.username}
          </span>
          <nav className="ml-auto flex items-center gap-4 text-sm font-bold">
            <Link href="/dashboard" className="text-ink-soft underline">Dashboard</Link>
            <form action={logoutAction}>
              <button className="text-ink-soft underline">Log out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  )
}
