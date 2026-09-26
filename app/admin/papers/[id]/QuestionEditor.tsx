'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { OptionLabel } from '../../../../lib/types'
import { editQuestionAction } from './actions'
import { emptyEdit } from './edit-state'

/**
 * Correcting a question's wording after publication. The key is not editable
 * here: changing it rescores, so it has its own control (KeyEditor).
 */
export function QuestionEditor({
  testId, questionId, questionNumber, text, options, solution,
}: {
  testId: string
  questionId: string
  questionNumber: number
  text: string
  options: [OptionLabel, string][]
  solution: string
}) {
  const [open, setOpen] = useState(false)
  // Controlled, because React resets an uncontrolled form after its action
  // runs, which would throw away the admin's edits when the check refuses them.
  const [draftText, setDraftText] = useState(text)
  const [draftOptions, setDraftOptions] = useState(options)
  const [draftSolution, setDraftSolution] = useState(solution)
  const [state, action] = useActionState(editQuestionAction, emptyEdit)
  const errors = state.issues.filter((i) => i.severity === 'error')
  const warnings = state.issues.filter((i) => i.severity === 'warning')

  if (!open) {
    return (
      <span className="inline-flex items-center gap-3">
        {state.saved && <span className="text-xs font-semibold text-answered">Saved.</span>}
        <button type="button" onClick={() => setOpen(true)}
                className="text-xs font-bold text-play-purple underline">
          Edit wording
        </button>
      </span>
    )
  }

  const field = 'mt-1 block w-full rounded-xl border-2 border-line-strong px-3 py-2 text-sm'
  return (
    <form
      action={action}
      className="mt-2 basis-full rounded-control border-2 border-play-purple/30 bg-play-purple/5 p-4 text-left"
    >
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="questionId" value={questionId} />
      <p className="text-sm font-bold">Q{questionNumber}: text, options and solution</p>

      <label className="mt-3 block text-xs font-bold uppercase tracking-widest text-ink-soft">
        Question
        <textarea name="text" value={draftText} onChange={(e) => setDraftText(e.target.value)}
                  rows={4} required className={field} />
      </label>
      {draftOptions.map(([label, value], i) => (
        <label key={label} className="mt-2 block text-xs font-bold uppercase tracking-widest text-ink-soft">
          Option {label}
          <input
            name={`option-${label}`} value={value} required className={field}
            onChange={(e) => setDraftOptions(draftOptions.map((o, j) => (j === i ? [label, e.target.value] : o)))}
          />
        </label>
      ))}
      <label className="mt-2 block text-xs font-bold uppercase tracking-widest text-ink-soft">
        Solution
        <textarea name="solution" value={draftSolution} onChange={(e) => setDraftSolution(e.target.value)}
                  rows={3} className={field} />
      </label>

      <p className="mt-3 text-xs text-ink-soft">
        Checked with the same rules as an upload. Scores are not affected; to change the answer,
        use &ldquo;Correct this key&rdquo;.
      </p>

      {state.fatal && <p role="alert" className="mt-2 text-sm font-semibold text-notanswered">{state.fatal}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-sm text-notanswered">
          {errors.map((i, n) => <li key={n}>{i.message} <span className="font-mono text-[11px]">{i.code}</span></li>)}
        </ul>
      )}
      {state.saved && (
        <p className="mt-2 text-sm font-semibold text-answered">
          Saved.{warnings.length ? ` ${warnings.map((w) => w.message).join(' ')}` : ''}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setOpen(false)}
                className="rounded-xl border-2 border-line-strong px-4 py-2 text-sm font-bold">
          Close
        </button>
        <Save />
      </div>
    </form>
  )
}

function Save() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
            className="rounded-xl bg-play-purple px-4 py-2 text-sm font-black text-white disabled:opacity-40">
      {pending ? 'Saving...' : 'Save changes'}
    </button>
  )
}
