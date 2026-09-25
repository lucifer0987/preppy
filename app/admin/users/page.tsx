import Link from 'next/link'
import { currentUser } from '../../../lib/auth'
import { listUsers } from '../../../lib/repo/users'
import { CreateUserForm, ResetPasswordForm } from './UserForms'
import { toggleActiveAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const me = await currentUser()
  const users = await listUsers()

  return (
    <>
      <Link href="/admin" className="text-sm font-bold text-play-purple">&larr; Admin</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">People</h1>
      <p className="mt-1 text-ink-soft">
        There is no sign-up. Accounts exist only because you created them.
      </p>

      <CreateUserForm />

      <div className="mt-8 overflow-x-auto rounded-3xl bg-white p-5">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-soft">
              <th className="py-2 pr-3 font-bold">Username</th>
              <th className="py-2 pr-3 font-bold">Name</th>
              <th className="py-2 pr-3 font-bold">Role</th>
              <th className="py-2 px-2 text-right font-bold">Papers</th>
              <th className="py-2 pr-3 font-bold">Last seen</th>
              <th className="py-2 pr-3 font-bold">Status</th>
              <th className="py-2 font-bold" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-black/10 align-top">
                <td className="py-3 pr-3 font-mono font-semibold">{u.username}</td>
                <td className="py-3 pr-3">{u.displayName}</td>
                <td className="py-3 pr-3">
                  {u.role === 'admin' ? (
                    <span className="rounded-full bg-play-purple px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                      admin
                    </span>
                  ) : (
                    <span className="text-ink-soft">student</span>
                  )}
                </td>
                <td className="py-3 px-2 text-right tabular-nums">
                  {u.role === 'admin' ? '—' : u.attemptCount}
                </td>
                <td className="py-3 pr-3 text-ink-soft">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'never'}
                </td>
                <td className="py-3 pr-3">
                  {u.isActive
                    ? <span className="text-answered">active</span>
                    : <span className="text-notanswered">inactive</span>}
                  {u.mustChangePassword && (
                    <span className="block text-[10px] uppercase tracking-widest text-ink-soft">
                      must change password
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex flex-col items-end gap-1">
                    <ResetPasswordForm userId={u.id} username={u.username} />
                    {u.id !== me?.id && (
                      <form action={toggleActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="isActive" value={String(!u.isActive)} />
                        <button className="text-xs font-bold text-ink-soft underline">
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Deactivating keeps every attempt and every leaderboard entry. It only stops them logging in.
      </p>
    </>
  )
}
