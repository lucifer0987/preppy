'use client'

import { useState } from 'react'

/**
 * Keeps a question's key out of sight until the reader asks for it.
 *
 * Both states are rendered on the server and handed in as children, so this
 * component never receives the question, the key or the solution -- it only
 * chooses which of two finished trees to show. That keeps the archive's
 * questions server-rendered, which is what they were before this existed.
 *
 * What it is not: a secret. The sealed copy and the revealed copy are both in
 * the page, so anybody willing to open developer tools can read the key
 * without pressing the button. That is fine, and deliberate -- this screen is
 * only reachable once the paper has closed or the reader has handed it in
 * (FR-4.3), so the answers are no longer confidential by then. The button is
 * there to keep a question you did not answer worth attempting again, not to
 * withhold anything.
 */
export function RevealAnswer({ sealed, revealed, label }: {
  sealed: React.ReactNode
  revealed: React.ReactNode
  /** Named for a screen reader, which hears the button out of context. */
  label: string
}) {
  const [open, setOpen] = useState(false)
  if (open) return <>{revealed}</>

  return (
    <>
      {sealed}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-quiet mt-4 w-full sm:w-auto"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M10 4c-4 0-7.2 2.7-8.5 5.6a1 1 0 0 0 0 .8C2.8 13.3 6 16 10 16s7.2-2.7 8.5-5.6a1 1 0 0 0 0-.8C17.2 6.7 14 4 10 4zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </svg>
        Reveal the answer
        <span className="sr-only"> to {label}</span>
      </button>
    </>
  )
}
