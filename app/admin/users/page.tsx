import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { listUsers } from '../../../lib/repo/users'
import { formatIstDate, istDate } from '../../../lib/time'
import { CreateUserForm, ResetPasswordForm } from './UserForms'
import { BulkImport } from './BulkImport'
import { toggleActiveAction } from './actions'
import { PageHeader, TableShell, Th } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const me = await requireAdmin()
  const users = await listUsers()

  return (
    <>
      <PageHeader compact title="People" lede="Six accounts, no self-service. You create them, you reset them, and a deactivated one keeps its history." />

      <CreateUserForm />
      <BulkImport />

      <div className="mt-8">
        <TableShell minWidth="46rem">
          <thead>
            <tr className="border-b border-line">
              <Th>Username</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th align="right">Papers</Th>
              <Th>Last seen</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line align-top last:border-0">
                <td className="numeral px-3 py-3 font-semibold">{u.username}</td>
                <td className="px-3 py-3">{u.displayName}</td>
                <td className="px-3 py-3">
                  {u.role === 'admin' ? (
                    <span className="pill-brand px-2 py-0.5 text-[10px] uppercase tracking-widest">
                      admin
                    </span>
                  ) : (
                    <span className="text-ink-soft">student</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {u.role === 'admin' ? '—' : (
                    <Link href={`/admin/attempts?user=${u.id}`} className="font-bold text-accent underline"
                          aria-label={`${u.attemptCount} papers: see ${u.displayName}'s attempts`}>
                      {u.attemptCount}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-soft">
                  {u.lastLoginAt ? formatIstDate(istDate(new Date(u.lastLoginAt))) : 'never'}
                </td>
                <td className="px-3 py-3">
                  {u.isActive
                    ? <span className="text-good-ink">active</span>
                    : <span className="text-bad-ink">inactive</span>}
                  {u.mustChangePassword && (
                    <span className="block text-[10px] uppercase tracking-widest text-ink-soft">
                      must change password
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-end gap-1">
                    <ResetPasswordForm userId={u.id} username={u.username} />
                    {u.id !== me.id && (
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
        </TableShell>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Deactivating keeps every attempt and every leaderboard entry. It only stops them logging in.
      </p>
    </>
  )
}
