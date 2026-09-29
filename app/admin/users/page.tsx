import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import { listUsers } from '../../../lib/repo/users'
import { formatIstDate, istDate } from '../../../lib/time'
import { CreateUserForm, RenameForm, ResetPasswordForm } from './UserForms'
import { BulkImport } from './BulkImport'
import { toggleActiveAction } from './actions'
import { TrackCell } from './TrackCell'
import { listTracks } from '../../../lib/repo/tracks'
import { PageHeader, StatusChip, TableShell, Th } from '../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const me = await requireAdmin()
  const [users, tracks] = await Promise.all([listUsers(), listTracks()])
  // With one exam there is nothing to say about which: every student is on it.
  const manyTracks = tracks.length > 1

  return (
    <>
      <PageHeader
        compact
        title="People"
        lede="Nobody signs themselves up. You create the account, you rename it, you set a new password when one is forgotten, and a deactivated account keeps everything it ever scored."
      />

      <CreateUserForm tracks={tracks} />
      <BulkImport tracks={tracks} />

      <div className="mt-8">
        <TableShell minWidth="52rem">
          <thead>
            <tr className="border-b border-line">
              <Th>Username</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              {manyTracks && <Th>Exam</Th>}
              <Th align="right">Papers</Th>
              <Th>Last seen</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line align-middle last:border-0 transition hover:bg-surface-sunken/60">
                <td className="numeral px-3 py-3 font-semibold">{u.username}</td>
                <td className="px-3 py-3">
                  <RenameForm userId={u.id} displayName={u.displayName} />
                </td>
                <td className="px-3 py-3">
                  {u.role === 'admin' ? (
                    <span className="pill-brand px-2 py-0.5 text-[10px] uppercase tracking-widest">
                      admin
                    </span>
                  ) : (
                    <span className="text-ink-soft">student</span>
                  )}
                </td>
                {manyTracks && (
                  <td className="px-3 py-3">
                    {u.role === 'admin'
                      ? <span className="text-ink-faint">every exam</span>
                      : <TrackCell userId={u.id} trackId={u.trackId} tracks={tracks} />}
                  </td>
                )}
                <td className="px-3 py-3 text-right tabular-nums">
                  {u.role === 'admin' ? '—' : (
                    <Link href={`/admin/attempts?user=${u.id}`} className="tap-target font-bold text-accent underline"
                          aria-label={`${u.attemptCount} papers: see ${u.displayName}'s attempts`}>
                      {u.attemptCount}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-soft">
                  {u.lastLoginAt ? formatIstDate(istDate(new Date(u.lastLoginAt))) : 'never'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip tone={u.isActive ? 'good' : 'bad'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </StatusChip>
                    {u.mustChangePassword && (
                      <StatusChip tone="waiting">Temp password</StatusChip>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ResetPasswordForm userId={u.id} username={u.username} />
                    {u.id !== me.id && (
                      <form action={toggleActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="isActive" value={String(!u.isActive)} />
                        <button className="tap-target btn btn-quiet px-3 py-1.5 text-xs">
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
        A username is the login and never changes. A name is what the board and the archive show,
        so click it to edit it at any time. Deactivating only stops the login: every attempt and
        every leaderboard entry stays.
      </p>
    </>
  )
}
