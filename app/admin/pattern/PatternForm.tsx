'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { savePatternAction } from './actions'
import { emptyPatternForm } from './state'
import { patternBands, patternTotals, SECTION_NAMES, type Pattern, type SectionPattern } from '../../../lib/types'
import { Flash } from '../../../components/Page'
import { SectionShape } from '../../../components/SectionShape'

/**
 * Editing the default paper pattern.
 *
 * The totals underneath recompute as you type, including the question numbers
 * each section would hold, so the effect of a change is visible before it is
 * saved. The four sections themselves are fixed -- they are the exam's, not a
 * setting -- so only their numbers are editable.
 */
export function PatternForm({ current, latestEntryClose }: {
  current: Pattern
  /** What the saved window closes entry at, in minutes, to warn about a clash. */
  latestEntryClose: number
}) {
  const [state, action] = useActionState(savePatternAction, emptyPatternForm)
  const [draft, setDraft] = useState<Pattern>(current)

  const totals = patternTotals(draft)
  const bands = patternBands(draft)
  const numbers = draft.every((s) => Number.isInteger(s.questions) && s.questions > 0)
  const sane = draft.every((s) =>
    Number.isInteger(s.minutes) && s.minutes > 0 && s.marksCorrect > 0 && s.marksNegative >= 0)

  // The hard stop is entry close plus the paper's length, so a longer pattern
  // can leave the saved window impossible. Say so here rather than at save.
  const overrunsTheDay = latestEntryClose + totals.minutes > 24 * 60
  const tooLong = totals.minutes > 8 * 60

  const set = (code: string, k: keyof SectionPattern) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(draft.map((s) => s.code === code ? { ...s, [k]: Number(e.target.value) } : s))

  return (
    <form action={action} className="mt-4 card p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-soft">
              <th className="pb-2 pr-3">Section</th>
              <th className="pb-2 pr-3">Questions</th>
              <th className="pb-2 pr-3">Minutes</th>
              <th className="pb-2 pr-3">Correct</th>
              <th className="pb-2">Wrong</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((s, i) => (
              <tr key={s.code} className="border-t border-line">
                {/* The same badge the briefing and the result use, so an admin
                    reading this table is looking at the section a student
                    recognises rather than a row of names. */}
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2.5">
                    <SectionShape index={i} />
                    <span className="font-semibold">{SECTION_NAMES[s.code]}</span>
                  </span>
                </td>
                <Cell name={`${s.code}.questions`} value={s.questions} step={1} min={1} max={200}
                      onChange={set(s.code, 'questions')} label={`${s.code} questions`} />
                <Cell name={`${s.code}.minutes`} value={s.minutes} step={1} min={1} max={180}
                      onChange={set(s.code, 'minutes')} label={`${s.code} minutes`} />
                <Cell name={`${s.code}.marksCorrect`} value={s.marksCorrect} step={0.25} min={0.25} max={10}
                      onChange={set(s.code, 'marksCorrect')} label={`${s.code} marks for a correct answer`} />
                <Cell name={`${s.code}.marksNegative`} value={s.marksNegative} step={0.25} min={0} max={10}
                      onChange={set(s.code, 'marksNegative')} label={`${s.code} penalty for a wrong answer`} last />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-control bg-surface-sunken p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">What a paper becomes</p>
        {!numbers || !sane ? (
          <p className="mt-2 text-sm font-semibold text-bad-ink">
            Every box needs a number: whole questions and minutes, marks above zero, a penalty of zero or more.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold tabular-nums">
              {totals.questions} questions &middot; {totals.minutes} minutes &middot;{' '}
              {totals.maxMarks} marks at best, {totals.minMarks} at worst
            </p>
            <ul className="mt-2 space-y-1 text-sm tabular-nums text-ink-soft">
              {bands.map((b) => (
                <li key={b.code}>
                  {SECTION_NAMES[b.code]} holds Q{b.from}&ndash;Q{b.to}
                </li>
              ))}
            </ul>
            {tooLong && (
              <p className="mt-3 text-sm font-semibold text-bad-ink">
                {totals.minutes} minutes is longer than the {8 * 60} a single paper may run.
              </p>
            )}
            {!tooLong && overrunsTheDay && (
              <p className="mt-3 text-sm font-semibold text-bad-ink">
                A {totals.minutes}-minute paper cannot finish before midnight if entry stays open as
                late as it does now. Move the last entry time earlier on the window screen first.
              </p>
            )}
          </>
        )}
      </div>

      {state.error && (
        <Flash tone="bad" className="mt-4">
          {state.error}
        </Flash>
      )}
      {state.saved && !state.error && (
        <Flash tone="good" className="mt-4">
          Saved. Papers already uploaded keep the shape they were given.
        </Flash>
      )}

      {/* The caveat belongs before the button, not after it: it is something
          to know while deciding, not after committing. */}
      <p className="measure-wide mt-5 text-xs text-ink-soft">
        This is the shape a paper is given when its file does not say. A file may state its own{' '}
        <code>questionCount</code>, <code>durationMinutes</code>, <code>marksCorrect</code> and{' '}
        <code>marksNegative</code> per section, and those always win.
      </p>
      {/* Disabled for the same reasons the server refuses, so the button never
          promises something that will come back as an error. */}
      <Save disabled={!numbers || !sane || tooLong || overrunsTheDay} />
    </form>
  )
}

function Cell({ name, value, step, min, max, onChange, label, last }: {
  name: string; value: number; step: number; min: number; max: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; label: string; last?: boolean
}) {
  return (
    <td className={`py-2.5 ${last ? '' : 'pr-3'}`}>
      <input
        type="number" name={name} value={value} step={step} min={min} max={max} required
        aria-label={label} onChange={onChange}
        className="field w-20 tabular-nums"
      />
    </td>
  )
}

function Save({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={disabled || pending}
      className="btn btn-primary mt-4 px-7"
    >
      {pending ? 'Saving...' : 'Save pattern'}
    </button>
  )
}
