'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { uploadAction } from './actions'
import { emptyUpload } from './state'
import type { Issue } from '../../../../lib/types'
import { Flash } from '../../../../components/Page'

export function UploadForm() {
  const [state, action] = useActionState(uploadAction, emptyUpload)
  const errors = state.issues.filter((i) => i.severity === 'error')
  const warnings = state.issues.filter((i) => i.severity === 'warning')

  return (
    <>
      <form action={action} className="mt-6 rounded-card border border-dashed border-line-strong bg-surface p-6">
        <label className="block">
          <span className="eyebrow">Paper file</span>
          <input
            type="file"
            name="paper"
            accept=".json,application/json"
            required
            className="mt-2 block w-full text-sm file:mr-4 file:rounded-xl file:border-0
                       file:bg-play-purple file:px-4 file:py-2.5 file:text-sm file:font-bold
                       file:text-white hover:file:bg-play-purple-deep"
          />
        </label>
        <p className="mt-3 text-sm text-ink-soft">
          The paper as a .json file. The format is documented in{' '}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5">docs/architecture.html</code>, section 7.
        </p>
        <label className="mt-5 block">
          <span className="eyebrow">Images (optional)</span>
          <input
            type="file"
            name="images"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
            className="mt-2 block w-full text-sm file:mr-4 file:rounded-xl file:border-0
                       file:bg-surface-sunken file:px-4 file:py-2.5 file:text-sm file:font-bold"
          />
        </label>
        <p className="mt-3 text-sm text-ink-soft">
          Every file the paper names in <code className="rounded bg-surface-sunken px-1.5 py-0.5">images</code>,
          under 2 MB each. Up to 10 MB with the paper.
        </p>
        <Submit />
      </form>

      {state.fatal && (
        <Flash tone="bad" className="mt-4">
          {state.fatal}
        </Flash>
      )}

      <IssueList title="Blocking errors" tone="error" issues={errors} />
      <IssueList title="Warnings" tone="warning" issues={warnings} />

    </>
  )
}

function IssueList({ title, tone, issues }: { title: string; tone: 'error' | 'warning'; issues: Issue[] }) {
  if (!issues.length) return null
  const accent = tone === 'error' ? 'text-bad-ink' : 'text-warn-ink'
  return (
    <section className="mt-4 rounded-control bg-surface p-5">
      <h2 className={`text-xs font-bold uppercase tracking-widest ${accent}`}>
        {issues.length} {title.toLowerCase()}
      </h2>
      <ul className="mt-3 space-y-2">
        {issues.map((i, n) => (
          <li key={n} className="border-b border-line pb-2 last:border-0 last:pb-0">
            <p className="text-sm">{i.message}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
              {i.path ?? 'document'} &middot; {i.code}
            </p>
            {i.excerpt && (
              <p className="mt-1 overflow-x-auto rounded bg-surface-sunken px-2 py-1 font-mono text-[11px]">
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
      className="btn btn-primary mt-5"
    >
      {pending ? 'Reading...' : 'Check this paper'}
    </button>
  )
}
