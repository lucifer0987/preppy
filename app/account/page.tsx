import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAnySignedIn } from '../../lib/guard'
import { logoutAction } from '../login/actions'
import { ChangePasswordForm } from './ChangePasswordForm'
import { renameSelfAction } from './actions'
import { NameField } from '../../components/NameField'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Wordmark } from '../../components/Wordmark'

export const metadata: Metadata = { title: 'Your account' }
export const dynamic = 'force-dynamic'

/**
 * Your account: your name, and your password.
 *
 * Deliberately not inside the app shell. A forced password change is the first
 * thing a new account sees, before there is anything to navigate to, and
 * offering tabs to a dashboard that will bounce you straight back here would
 * be a dead end. So the page stays on its own and, while the change is forced,
 * shows nothing but the change: your name is not the thing standing between
 * you and the paper.
 */
export default async function AccountPage() {
  const user = await requireAnySignedIn()
  const forced = user.mustChangePassword
  // An admin who came here from the console rail belongs back in the console,
  // not in the student view.
  const home = user.role === 'admin'
    ? { href: '/admin', label: 'Back to the console' }
    : { href: '/dashboard', label: 'Back to the dashboard' }

  return (
    <main className="shell relative flex min-h-dvh items-center justify-center py-10">
      {/* Same corner as every other screen without a header. */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
      <Wordmark size="sm" />

      {forced && (
        <p className="mt-8 flex items-start gap-2.5 rounded-control border border-accent/40
                      bg-accent-soft px-4 py-3 text-sm font-medium text-ink">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-accent">
            <path d="M10 1.5a4 4 0 00-4 4V8H5.5A1.5 1.5 0 004 9.5v7A1.5 1.5 0 005.5 18h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 8H14V5.5a4 4 0 00-4-4zm-2 4a2 2 0 114 0V8H8V5.5z" />
          </svg>
          <span>One step before you start. This is the only thing you cannot skip.</span>
        </p>
      )}

      <h1 className={`text-3xl font-black tracking-tight ${forced ? 'mt-5' : 'mt-7'}`}>
        {forced ? 'Choose your own password' : 'Your account'}
      </h1>
      <p className="mt-2 text-ink-soft">
        {forced
          ? 'Your admin set the one you just used, which means they know it. Pick your own.'
          : 'Two things, both yours to change.'}
      </p>

      {!forced && (
        <section className="card mt-6 p-5">
          <NameField displayName={user.displayName} action={renameSelfAction} />
        </section>
      )}

      <section className={forced ? '' : 'card mt-4 p-5'}>
        {!forced && (
          <>
            <p className="eyebrow">Your password</p>
            <p className="measure mt-1.5 text-sm text-ink-soft">
              You will stay signed in on this device. Every other device is signed out.
            </p>
          </>
        )}
        <ChangePasswordForm />
      </section>

      <div className="mt-7 space-y-3 border-t border-line pt-4">
        <p className="text-sm text-ink-soft">
          There is no email on file, so nobody can send you a reset link. Forget this password
          and{' '}
          {user.role === 'admin'
            ? 'another admin sets a new one for you from People.'
            : 'your admin sets a new one for you.'}
        </p>
        <div className="flex items-center gap-4 text-sm font-semibold">
          {!forced && (
            <Link href={home.href} className="tap-target text-accent underline underline-offset-4">
              {home.label}
            </Link>
          )}
          <form action={logoutAction}>
            <button className="tap-target text-ink-soft underline underline-offset-4 transition hover:text-bad-ink">
              Log out
            </button>
          </form>
        </div>
      </div>
      </div>
    </main>
  )
}
