'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { bulkCreateAction } from './actions'
import { emptyBulk } from './state'
import { MAX_BULK_ROWS, credentialsToCsv } from '../../../lib/csv'

const SAMPLE = `username,display_name,role
student6,Student Six,student
student7,Student Seven,student`

export function BulkImport() {
  const [state, action] = useActionState(bulkCreateAction, emptyBulk)
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 text-sm font-bold text-accent underline">
        Add several at once from a CSV
      </button>
    )
  }

  return (
    <section className="mt-4 rounded-card bg-surface p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-black">Bulk import</h2>
        <button onClick={() => setOpen(false)} className="text-sm font-bold text-ink-soft underline">
          Close
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        One row per person: <code className="rounded bg-surface-sunken px-1.5 py-0.5">username,display name,role</code>.
        The role is optional and defaults to student. A header row is fine. Up to {MAX_BULK_ROWS} at a time.
      </p>

      <form action={action} className="mt-3">
        <textarea
          name="csv" rows={6} defaultValue={SAMPLE} spellCheck={false}
          className="field font-mono text-sm"
        />
        <Submit />
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-control bg-notanswered px-5 py-3 font-semibold text-white">
          {state.error}
        </p>
      )}

      {state.problems.length > 0 && (
        <div className="mt-3 rounded-control bg-play-yellow/15 p-4">
          <p className="eyebrow">
            {state.problems.length} row{state.problems.length === 1 ? '' : 's'} skipped
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.problems.map((p) => (
              <li key={`${p.line}-${p.raw}`}>
                <span className="font-mono text-ink-soft">line {p.line}:</span> {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.warnings.length > 0 && (
        <div className="mt-3 rounded-control bg-surface-sunken p-4">
          <p className="eyebrow">
            Imported, but check {state.warnings.length === 1 ? 'this row' : 'these rows'}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.warnings.map((w) => (
              <li key={`${w.line}-${w.raw}`}>
                <span className="font-mono text-ink-soft">line {w.line}:</span> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.failed.length > 0 && (
        <div className="mt-3 rounded-control bg-notanswered/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-bad">
            {state.failed.length} could not be created
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.failed.map((f) => (
              <li key={f.username}><span className="font-mono">{f.username}</span>: {f.message}</li>
            ))}
          </ul>
        </div>
      )}

      {state.created.length > 0 && <Credentials rows={state.created} />}
    </section>
  )
}

/**
 * Passwords are shown once. The download is built in the browser from data the
 * page already holds, so nothing extra is stored on the server.
 */
function Credentials({ rows }: { rows: { username: string; password: string }[] }) {
  const csv = credentialsToCsv(rows)
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`

  return (
    <div className="mt-4 rounded-control bg-answered p-5 text-white">
      <p className="text-xs font-bold uppercase tracking-widest text-white/70">
        {rows.length} account{rows.length === 1 ? '' : 's'} created — copy these now
      </p>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-sunken p-3 font-mono text-sm">{csv}</pre>
      <a
        href={href} download="preppy-accounts.csv"
        className="mt-3 inline-block rounded-xl bg-surface px-4 py-2 text-sm font-black text-good"
      >
        Download as CSV
      </a>
      <p className="mt-2 text-sm text-white/80">
        Everyone must change their password the first time they log in.
      </p>
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="mt-3 rounded-xl bg-play-purple px-5 py-2.5 font-black text-white
                 transition hover:bg-play-purple-deep disabled:opacity-60"
    >
      {pending ? 'Creating...' : 'Create these accounts'}
    </button>
  )
}
