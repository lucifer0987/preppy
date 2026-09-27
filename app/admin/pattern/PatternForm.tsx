'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { savePatternAction } from './actions'
import { emptyPatternForm } from './state'
import {
  ALL_SECTION_CODES, DEFAULT_PATTERN, SECTION_NAMES, patternBands, patternTotals,
  sectionName, type Pattern, type SectionCode, type SectionPattern,
} from '../../../lib/types'
import { Flash } from '../../../components/Page'
import { SectionShape } from '../../../components/SectionShape'

/**
 * Editing one track's pattern.
 *
 * This used to be four fixed rows of numbers, because the four sections were
 * the exam's and the exam was the product. A track decides which sections it
 * has, so a section can now be added, removed, renamed and moved, and the
 * totals underneath recompute as you type -- including the question numbers
 * each section would hold, so the effect of a change is visible before it is
 * saved.
 *
 * Membership and order travel as one ordered `codes` field rather than as a
 * position box per row. Two rows claiming position 3 is a state this form
 * cannot get into if the list itself is the order.
 */
export function PatternForm({ trackId, current, latestEntryClose }: {
  trackId: string
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
  const unused = ALL_SECTION_CODES.filter((c) => !draft.some((s) => s.code === c))

  const set = (code: SectionCode, k: keyof SectionPattern) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(draft.map((s) => s.code === code
        ? { ...s, [k]: k === 'label' ? e.target.value : Number(e.target.value) }
        : s))

  const add = (code: SectionCode) => {
    const shipped = DEFAULT_PATTERN.find((d) => d.code === code)
    setDraft([...draft, shipped ?? {
      code, questions: 10, minutes: 9, marksCorrect: 1, marksNegative: 0.25,
    }])
  }

  const remove = (code: SectionCode) => setDraft(draft.filter((s) => s.code !== code))

  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= draft.length) return
    const next = [...draft]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setDraft(next)
  }

  return (
    <form action={action} className="mt-4 card p-5">
      <input type="hidden" name="trackId" value={trackId} />
      {/* Membership and order in one field, so the server reads the pattern
          the admin is looking at rather than reassembling it from row keys. */}
      <input type="hidden" name="codes" value={draft.map((s) => s.code).join(',')} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-soft">
              <th className="pb-2 pr-3">Order</th>
              <th className="pb-2 pr-3">Section</th>
              <th className="pb-2 pr-3">Questions</th>
              <th className="pb-2 pr-3">Minutes</th>
              <th className="pb-2 pr-3">Correct</th>
              <th className="pb-2 pr-3">Wrong</th>
              <th className="pb-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((s, i) => (
              <tr key={s.code} className="border-t border-line">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-1">
                    <Move dir="up" disabled={i === 0} onClick={() => move(i, -1)}
                          label={`Move ${sectionName(draft, s.code)} earlier`} />
                    <Move dir="down" disabled={i === draft.length - 1} onClick={() => move(i, 1)}
                          label={`Move ${sectionName(draft, s.code)} later`} />
                  </span>
                </td>
                {/* The same badge the briefing and the result use, so an admin
                    reading this table is looking at the section a student
                    recognises rather than a row of names. */}
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2.5">
                    <SectionShape index={i} />
                    <input
                      type="text" name={`${s.code}.label`} maxLength={60}
                      value={s.label ?? ''} placeholder={SECTION_NAMES[s.code]}
                      onChange={set(s.code, 'label')}
                      aria-label={`What this exam calls ${SECTION_NAMES[s.code]}`}
                      className="field w-56 font-semibold"
                    />
                  </span>
                </td>
                <Cell name={`${s.code}.questions`} value={s.questions} step={1} min={1} max={200}
                      onChange={set(s.code, 'questions')} label={`${s.code} questions`} />
                <Cell name={`${s.code}.minutes`} value={s.minutes} step={1} min={1} max={180}
                      onChange={set(s.code, 'minutes')} label={`${s.code} minutes`} />
                <Cell name={`${s.code}.marksCorrect`} value={s.marksCorrect} step={0.25} min={0.25} max={10}
                      onChange={set(s.code, 'marksCorrect')} label={`${s.code} marks for a correct answer`} />
                <Cell name={`${s.code}.marksNegative`} value={s.marksNegative} step={0.25} min={0} max={10}
                      onChange={set(s.code, 'marksNegative')} label={`${s.code} penalty for a wrong answer`} />
                <td className="py-2.5">
                  <button
                    type="button" onClick={() => remove(s.code)} disabled={draft.length === 1}
                    className="rounded-control px-2 py-1 text-xs font-bold text-ink-faint transition
                               hover:bg-bad/10 hover:text-bad-ink disabled:opacity-40
                               disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                    aria-label={`Remove ${sectionName(draft, s.code)}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unused.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">Add a section</span>
          {unused.map((code) => (
            <button
              key={code} type="button" onClick={() => add(code)}
              className="rounded-pill border border-line-strong px-3 py-1 text-xs font-bold
                         transition hover:border-accent hover:text-accent"
            >
              + {SECTION_NAMES[code]}
            </button>
          ))}
        </div>
      )}

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
                  {sectionName(draft, b.code)} holds Q{b.from}&ndash;Q{b.to}
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
      <p className="mt-5 text-xs text-ink-soft">
        This is the shape a paper on this exam is given when its file does not say. A file may
        state its own <code>questionCount</code>, <code>durationMinutes</code>,{' '}
        <code>marksCorrect</code> and <code>marksNegative</code> per section, and those always win.
        A paper whose sections are not these, in this order, is refused.
      </p>
      {/* Disabled for the same reasons the server refuses, so the button never
          promises something that will come back as an error. */}
      <Save disabled={!numbers || !sane || tooLong || overrunsTheDay} />
    </form>
  )
}

function Cell({ name, value, step, min, max, onChange, label }: {
  name: string; value: number; step: number; min: number; max: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; label: string
}) {
  return (
    <td className="py-2.5 pr-3">
      <input
        type="number" name={name} value={value} step={step} min={min} max={max} required
        aria-label={label} onChange={onChange}
        className="field w-20 tabular-nums"
      />
    </td>
  )
}

function Move({ dir, disabled, onClick, label }: {
  dir: 'up' | 'down'; disabled: boolean; onClick: () => void; label: string
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-control border border-line text-ink-soft
                 transition hover:border-accent hover:text-accent disabled:opacity-30
                 disabled:hover:border-line disabled:hover:text-ink-soft"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 fill-current">
        {dir === 'up'
          ? <path d="M6 2 1.5 7.5h9z" />
          : <path d="M6 10 1.5 4.5h9z" />}
      </svg>
    </button>
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
