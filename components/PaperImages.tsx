'use client'

import { useState } from 'react'
import { imageUrl } from '../lib/images'

/**
 * A paper's images, served through /api/images so access is checked on every
 * request. A plain <img>: these are private, per-user responses that the
 * Next.js image optimiser must not cache and share.
 *
 * PRD 11, "image fails to load": a placeholder with a retry, never a broken
 * icon over a question the student cannot answer without it. A file that is
 * missing altogether is flagged to the admin on the paper page.
 */
export function PaperImages({ testId, names }: { testId: string; names?: string[] }) {
  if (!names?.length) return null
  return (
    <div className="mt-3 space-y-3">
      {names.map((name) => <PaperImage key={name} testId={testId} name={name} />)}
    </div>
  )
}

function PaperImage({ testId, name }: { testId: string; name: string }) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-sm">
        <span className="font-semibold">The figure &ldquo;{name}&rdquo; did not load.</span>
        <button
          type="button"
          onClick={() => { setFailed(false); setAttempt((n) => n + 1) }}
          className="btn btn-quiet px-3 py-1"
        >
          Retry
        </button>
      </div>
    )
  }

  // A retry asks again rather than reusing the failed response.
  const src = attempt ? `${imageUrl(testId, name)}?retry=${attempt}` : imageUrl(testId, name)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Figure ${name}`}
      onError={() => setFailed(true)}
      className="max-h-96 max-w-full rounded-xl border border-line bg-surface object-contain"
    />
  )
}
