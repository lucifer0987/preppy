import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { currentUser } from '../../lib/auth'
import { isConfigured } from '../../lib/env'
import { getPattern } from '../../lib/repo/settings'
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

  if ((await currentUser())?.isActive) redirect('/dashboard')

  // What a paper is, from the configured pattern rather than a sentence that
  // goes stale the first time somebody changes it.
  const pattern = await getPattern().catch(() => null)
  const totals = pattern ? patternTotals(pattern) : null
  const marking = pattern ? uniformMarking(pattern) : null

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* The brand half. Hidden on phones, where it would push the form below
          the fold for no gain. */}
      <aside className="relative hidden overflow-hidden bg-surface-invert px-12 py-14 text-white lg:flex lg:flex-col">
        <Glow />
        <div className="relative">
          <Wordmark tone="invert" />
        </div>

        <div className="relative mt-auto max-w-lg">
          <h2 className="font-display text-5xl font-black leading-[1.05] tracking-tight">
            One paper a night.<br />
            <span className="text-gold-300">One ranking</span> that never resets.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Real IBPS marking, a timer per section that only moves forward, and a
            leaderboard your cohort actually watches.
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
      <div className="flex flex-col justify-center px-6 py-14 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center justify-between">
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <div className="ml-auto"><ThemeToggle /></div>
          </div>

          <h1 className="mt-8 text-4xl font-black tracking-tight lg:mt-0">Log in</h1>
          <p className="mt-2 text-ink-soft">Username and password. Nothing else.</p>

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

          <p className="mt-10 border-t border-line pt-5 text-sm text-ink-soft">
            Forgotten your password? There is no email on file to send a reset to, so ask your admin to
            set a new one.
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
