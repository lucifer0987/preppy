import { redirect } from 'next/navigation'
import Link from 'next/link'
import { currentUser } from '../../lib/auth'
import { isConfigured } from '../../lib/env'
import { LoginForm } from './LoginForm'

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
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
        <h1 className="text-2xl font-black">Not configured yet</h1>
        <p className="mt-3 text-ink-soft">
          Supabase credentials are missing, so there is nothing to log in to. Follow{' '}
          <code className="rounded bg-white px-1.5 py-0.5">SETUP.md</code> to create the project and
          fill in <code className="rounded bg-white px-1.5 py-0.5">.env.local</code>.
        </p>
        <Link href="/" className="mt-6 font-bold text-play-purple underline">Back</Link>
      </main>
    )
  }

  if ((await currentUser())?.isActive) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm font-bold text-play-purple">&larr; Preppy</Link>
      <h1 className="mt-6 text-4xl font-black tracking-tight">Log in</h1>
      <p className="mt-2 text-ink-soft">Username and password. Nothing else.</p>
      {signedOut && (
        <p role="status" className="mt-4 rounded-xl bg-play-yellow/20 px-4 py-3 text-sm font-semibold">
          You were signed out here because your account opened the test on another device. A test
          runs in one place at a time; carry on there, or log in again to continue here.
        </p>
      )}
      <LoginForm />
      <p className="mt-8 border-t border-black/10 pt-4 text-sm text-ink-soft">
        Forgotten your password? There is no email on file to send a reset to, so ask your admin to
        set a new one.
      </p>
    </main>
  )
}
