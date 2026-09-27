import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { currentUser } from '../../lib/auth'
import { isConfigured } from '../../lib/env'
import { getPattern } from '../../lib/repo/tracks'
import { patternTotals, uniformMarking } from '../../lib/types'
import { LoginForm } from './LoginForm'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Wordmark } from '../../components/Wordmark'

export const metadata: Metadata = { title: 'Log in' }

/**
 * Depends on the current time and on who is logged in, so it must never be
 * prerendered: a statically built countdown would target a build-time instant.
 */
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const { signedOut } = await searchParams

  if (!isConfigured()) {
    return (
      <main className="shell flex min-h-dvh flex-col justify-center">
        <div className="mx-auto w-full max-w-xl">
        <Wordmark />
        <h1 className="mt-6 text-3xl font-black">Not configured yet</h1>
        <p className="mt-3 text-ink-soft">
          Supabase credentials are missing, so there is nothing to log in to. Follow{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm">docs/setup.html</code>{' '}
          to create the project and fill in{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm">.env.local</code>.
        </p>
        <Link href="/" className="mt-6 font-bold text-accent underline underline-offset-4">Back</Link>
        </div>
      </main>
    )
  }

  // Already signed in: same rule as a fresh login, or an admin who revisits
  // /login gets bounced to the student view.
  const signedIn = await currentUser()
  if (signedIn?.isActive) redirect(signedIn.role === 'admin' ? '/admin' : '/dashboard')

  // What a paper is, from the configured pattern rather than a sentence that
  // goes stale the first time somebody changes it.
  const pattern = await getPattern().catch(() => null)
  const totals = pattern ? patternTotals(pattern) : null
  const marking = pattern ? uniformMarking(pattern) : null

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Top-right of the page, which is where the switch sits on every screen
          that has no header to put it in. It used to float above the form,
          which put it in a different place on each of those screens. */}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      {/* The brand half. Hidden on phones, where it would push the form below
          the fold for no gain. */}
      <aside className="relative hidden overflow-hidden bg-surface-invert px-12 py-12 text-white lg:flex lg:flex-col">
        <Glow />
        <div className="relative">
          <Wordmark tone="invert" />
        </div>

        <div className="relative mt-auto max-w-lg">
          <h2 className="font-display text-5xl font-black leading-[1.05] tracking-tight">
            Sit today&rsquo;s paper.<br />
            <span className="text-gold-300">See where</span> it puts you.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Real marking, a timer per section that only moves forward, and a board that
            remembers every paper you have ever sat.
          </p>

          {totals && (
            <dl className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-white/15 bg-white/10">
              <Stat label="Questions" value={String(totals.questions)} />
              <Stat label="Minutes" value={String(totals.minutes)} />
              <Stat
                label="Marking"
                value={marking ? `+${marking.correct}/−${marking.negative}` : 'Per section'}
              />
            </dl>
          )}
        </div>

        <p className="relative mt-10 text-sm text-white/45">
          Closed cohort. Accounts are created by your admin.
        </p>
      </aside>

      {/* The form half. */}
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Wordmark />
          </div>

          <h1 className="mt-7 text-4xl font-black tracking-tight lg:mt-0">Welcome back</h1>
          <p className="mt-2 text-ink-soft">Your username and password. Nothing else to fill in.</p>

          {signedOut && (
            <p role="status"
               className="mt-6 flex items-start gap-2.5 rounded-control border border-warn/30 bg-warn/10
                          px-4 py-3 text-sm font-medium text-ink">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-warn">
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 9.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/>
              </svg>
              <span>
                You were signed out here because your account opened the test on another device. A test
                runs in one place at a time; carry on there, or log in again to continue here.
              </span>
            </p>
          )}

          <LoginForm />

          <p className="mt-8 border-t border-line pt-4 text-sm text-ink-soft">
            Forgotten it? There is no email on file to send a reset to, so your admin sets a new
            one for you.
          </p>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-invert px-4 py-4">
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-white/50">{label}</dt>
      <dd className="numeral mt-1 text-2xl font-bold text-white">{value}</dd>
    </div>
  )
}

/** Depth behind the brand panel, drawn rather than imported. */
function Glow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-600/35 blur-3xl" />
      <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-brand-500/20 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.07]"
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '28px 28px' }} />
    </div>
  )
}
