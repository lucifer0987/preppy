'use client'

import { useState } from 'react'
import { OPTION_LABELS, type OptionLabel } from '../../../../lib/types'
import { correctKeyAction } from './actions'

/**
 * Changing an answer key after a paper has run. Deliberately two steps: the
 * consequence is every attempt being rescored, so it should not be one stray
 * click away.
 */
export function KeyEditor({
  testId, questionId, questionNumber, current, present,
}: {
  testId: string
  questionId: string
  questionNumber: number
  current: OptionLabel
  present: OptionLabel[]
}) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<OptionLabel>(current)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-play-purple underline"
      >
        Correct this key
      </button>
    )
  }

  return (
    <form action={correctKeyAction} className="mt-2 rounded-2xl border-2 border-play-purple/30 bg-play-purple/5 p-4">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="questionId" value={questionId} />
      <p className="text-sm font-bold">Q{questionNumber}: the answer is</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {OPTION_LABELS.filter((l) => present.includes(l)).map((l) => (
          <label key={l} className="cursor-pointer">
            <input
              type="radio" name="answer" value={l} checked={choice === l}
              onChange={() => setChoice(l)} className="peer sr-only"
            />
            <span className="block rounded-xl border-2 border-black/15 px-4 py-2 font-bold
                             peer-checked:border-play-purple peer-checked:bg-play-purple peer-checked:text-white">
              {l}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Every attempt on this paper is rescored. Students see a note explaining why their score moved.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setOpen(false)}
                className="rounded-xl border-2 border-black/15 px-4 py-2 text-sm font-bold">
          Cancel
        </button>
        <button type="submit" disabled={choice === current}
                className="rounded-xl bg-play-purple px-4 py-2 text-sm font-black text-white disabled:opacity-40">
          Change key and rescore
        </button>
      </div>
    </form>
  )
}
