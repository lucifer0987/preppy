import Link from 'next/link'
import { logoutAction } from '../app/login/actions'
import { SoundToggle } from './SoundToggle'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'

/**
 * The frame every signed-in student page sits in.
 *
 * Each of these pages used to draw its own header, so the way back to the
 * dashboard was a small purple "&larr; Dashboard" on some and a full row of
 * links on others. One shell means the navigation is in the same place with the
 * same weight wherever you are, which is most of what makes an application feel
 * finished rather than assembled.
 */
export function AppShell({ user, current, children }: {
  user: { displayName: string; role: string; soundEnabled: boolean }
  current: 'dashboard' | 'leaderboard' | 'archive' | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur
                         supports-[backdrop-filter]:bg-surface/70"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="shell flex h-16 items-center gap-6">
          <Link href="/dashboard" className="shrink-0" aria-label="Preppy, go to dashboard">
            <Wordmark size="sm" />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            <Tab href="/dashboard" active={current === 'dashboard'}>Today</Tab>
            <Tab href="/leaderboard" active={current === 'leaderboard'}>Leaderboard</Tab>
            <Tab href="/archive" active={current === 'archive'}>Past papers</Tab>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <SoundToggle initial={user.soundEnabled} compact />
            {user.role === 'admin' && (
              <Link href="/admin"
                    className="hidden rounded-full border border-line-strong px-3 py-1.5 text-xs
                               font-bold uppercase tracking-widest text-ink-soft transition
                               hover:border-accent hover:text-accent sm:inline-block">
                Admin
              </Link>
            )}
            <UserMenu name={user.displayName} />
          </div>
        </div>

        {/* On a phone the tabs move below the mark, where they still fit. */}
        <nav className="shell flex gap-1 overflow-x-auto border-t border-line py-1.5 sm:hidden"
             aria-label="Main">
          <Tab href="/dashboard" active={current === 'dashboard'}>Today</Tab>
          <Tab href="/leaderboard" active={current === 'leaderboard'}>Leaderboard</Tab>
          <Tab href="/archive" active={current === 'archive'}>Past papers</Tab>
        </nav>
      </header>

      {children}

      <footer className="shell pb-8 pt-10">
        <p className="border-t border-line pt-5 text-xs text-ink-faint">
          Preppy &middot; daily mock tests for IBPS Specialist Officer (IT)
        </p>
      </footer>
    </div>
  )
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
        active ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
      ].join(' ')}
    >
      {children}
    </Link>
  )
}

/**
 * Plain links rather than a dropdown: two items do not earn a menu, and a
 * details/summary that needs JavaScript to close on outside clicks is a worse
 * experience than showing both.
 */
function UserMenu({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex items-center gap-2">
      <Link href="/change-password"
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-sunken"
            title={`${name} — change password`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft
                         font-display text-xs font-black text-accent">
          {initials || '?'}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold text-ink sm:inline">{name}</span>
      </Link>
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
  )
}
