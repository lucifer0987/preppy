'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { emptyUpload, uploadAction } from './actions'
import type { Issue } from '../../../../lib/types'

export function UploadForm() {
  const [state, action] = useActionState(uploadAction, emptyUpload)
  const errors = state.issues.filter((i) => i.severity === 'error')
  const warnings = state.issues.filter((i) => i.severity === 'warning')

  return (
    <>
      <form action={action} className="mt-6 rounded-3xl border-2 border-dashed border-black/15 bg-white p-6">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">Paper file</span>
          <input
            type="file"
            name="paper"
            accept=".pdf,.json,application/pdf,application/json"
            required
            className="mt-2 block w-full text-sm file:mr-4 file:rounded-xl file:border-0
                       file:bg-play-purple file:px-4 file:py-2.5 file:text-sm file:font-bold
                       file:text-white hover:file:bg-play-purple-deep"
          />
        </label>
        <p className="mt-3 text-sm text-ink-soft">
          A PDF exported from your document, or the .json directly. The format is documented in{' '}
          <code className="rounded bg-black/5 px-1.5 py-0.5">format/README.md</code>.
        </p>
        <Submit />
      </form>

      {state.fatal && (
        <p role="alert" className="mt-4 rounded-2xl bg-notanswered px-5 py-4 font-semibold text-white">
          {state.fatal}
        </p>
      )}

      {state.repairs.length > 0 && (
        <section className="mt-4 rounded-2xl bg-play-blue/10 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
            Repaired while reading
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A PDF text layer damages JSON in predictable ways. These were fixed automatically.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {state.repairs.map((r) => (
              <li key={r.kind} className="flex gap-3">
                <span className="w-12 shrink-0 text-right font-mono font-bold tabular-nums">{r.count}x</span>
                <span>{r.detail ?? r.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <IssueList title="Blocking errors" tone="error" issues={errors} />
      <IssueList title="Warnings" tone="warning" issues={warnings} />

    </>
  )
}

function IssueList({ title, tone, issues }: { title: string; tone: 'error' | 'warning'; issues: Issue[] }) {
  if (!issues.length) return null
  const accent = tone === 'error' ? 'text-notanswered' : 'text-play-yellow'
  return (
    <section className="mt-4 rounded-2xl bg-white p-5">
      <h2 className={`text-xs font-bold uppercase tracking-widest ${accent}`}>
        {issues.length} {title.toLowerCase()}
      </h2>
      <ul className="mt-3 space-y-2">
        {issues.map((i, n) => (
          <li key={n} className="border-b border-black/5 pb-2 last:border-0 last:pb-0">
            <p className="text-sm">{i.message}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
              {i.path ?? 'document'} &middot; {i.code}
            </p>
            {i.excerpt && (
              <p className="mt-1 overflow-x-auto rounded bg-black/5 px-2 py-1 font-mono text-[11px]">
                {i.excerpt}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-5 rounded-2xl bg-play-purple px-6 py-3 font-black text-white
                 transition hover:bg-play-purple-deep disabled:opacity-60"
    >
      {pending ? 'Reading...' : 'Check this paper'}
    </button>
  )
}
