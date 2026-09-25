import Link from 'next/link'
import { requireAnySignedIn } from '../../lib/guard'
import { logoutAction } from '../login/actions'
import { ChangePasswordForm } from './ChangePasswordForm'

export const dynamic = 'force-dynamic'

export default async function ChangePasswordPage() {
  const user = await requireAnySignedIn()
  const forced = user.mustChangePassword

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-black tracking-tight">
        {forced ? 'Choose your own password' : 'Change your password'}
      </h1>
      <p className="mt-2 text-ink-soft">
        {forced
          ? 'Your admin set the one you just used. Pick your own before you go any further.'
          : 'You will stay signed in on this device.'}
      </p>

      <ChangePasswordForm />

      <p className="mt-8 border-t border-black/10 pt-4 text-sm text-ink-soft">
        There is no email on file, so nobody can send you a reset. If you forget this one, your
        admin has to set a new one for you.
      </p>

      <div className="mt-4 flex gap-4 text-sm font-bold">
        {!forced && <Link href="/dashboard" className="text-play-purple underline">Back</Link>}
        <form action={logoutAction}>
          <button className="text-ink-soft underline">Log out</button>
        </form>
      </div>
    </main>
  )
}
