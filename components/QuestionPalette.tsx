'use client'

import type { OptionLabel } from '../lib/types'

/**
 * The question palette (FR-6.4.4).
 *
 * Shows only the current section: there is no route back to a finished one
 * (FR-6.4.2). At section end the grey cells become "not reached" and the red
 * ones "skipped", which is the distinction the result page reports.
 *
 * Each state has its own shape as well as its own colour, so status is never
 * carried by colour alone (PRD 8). The shapes are the ones the real IBPS exam
 * interface uses, so a student reads them without learning anything new.
 */
export type PaletteState = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked'

export function paletteState(
  visited: boolean, selected: OptionLabel | null, marked: boolean,
): PaletteState {
  if (marked) return selected ? 'answered-marked' : 'marked'
  if (selected) return 'answered'
  return visited ? 'not-answered' : 'not-visited'
}

const SHAPE: Record<PaletteState, { className: string; clipPath?: string }> = {
  // A fixed grey fill, so it takes a fixed dark number rather than the theme's
  // ink: white on this grey is 2.51:1, and in dark mode the ink is white.
  'not-visited': { className: 'rounded-md bg-notvisited text-slate-900' },
  'not-answered': {
    className: 'bg-notanswered text-white pb-1',
    clipPath: 'polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)',
  },
  answered: {
    className: 'bg-answered text-white pt-1',
    clipPath: 'polygon(50% 0, 100% 38%, 100% 100%, 0 100%, 0 38%)',
  },
  marked: { className: 'rounded-full bg-marked text-brand-950' },
  'answered-marked': { className: 'rounded-full bg-marked text-brand-950' },
}

/**
 * These also read out to a screen reader as "Question 7, seen but left blank",
 * so they are written as descriptions rather than as status codes. "Not
 * answered" and "not visited" were the two most confusable states in the
 * palette and never said what actually separates them.
 */
const LABEL: Record<PaletteState, string> = {
  'not-visited': 'not opened yet',
  'not-answered': 'seen but left blank',
  answered: 'answered',
  marked: 'marked for review',
  'answered-marked': 'answered and marked for review',
}

/** What each state becomes when the section ends (FR-6.4.4). */
const AT_END: Partial<Record<PaletteState, string>> = {
  'not-answered': 'counts as skipped',
  'not-visited': 'counts as not reached',
  marked: 'counts as skipped',
}

function Cell({ state, children }: { state: PaletteState; children?: React.ReactNode }) {
  const shape = SHAPE[state]
  return (
    <span
      className={`relative flex h-full w-full items-center justify-center ${shape.className}`}
      style={shape.clipPath ? { clipPath: shape.clipPath } : undefined}
    >
      {children}
    </span>
  )
}

export function QuestionPalette({
  states, current, onJump, compact = false,
}: {
  states: { number: number; state: PaletteState }[]
  current: number
  onJump: (number: number) => void
  /**
   * The grid alone: no heading, no legend.
   *
   * On a phone the palette is tucked above the controls rather than given a
   * column of its own, and there the legend is five rows of prose between a
   * student and the button they meant to press.
   *
   * What is lost, said plainly: on a small screen the legend is not shown at
   * all. The shapes and colours are unchanged and each cell still reads out
   * its own state to a screen reader ("Question 7, seen but left blank"), so
   * nothing is unreachable -- but a student meeting the shapes for the first
   * time on a phone has to infer them, and the briefing is where they are
   * explained.
   */
  compact?: boolean
}) {
  return (
    <div>
      {!compact && <h2 className="eyebrow">Questions</h2>}

      <div className={`grid gap-1.5 ${compact ? 'grid-cols-8' : 'mt-3 grid-cols-5'}`}>
        {states.map(({ number, state }) => (
          <button
            key={number}
            type="button"
            onClick={() => onJump(number)}
            aria-current={number === current ? 'true' : undefined}
            aria-label={`Question ${number}, ${LABEL[state]}`}
            className={[
              // The ring sits on the button, outside the clipped shape, so the
              // current question is marked whatever its shape.
              'relative aspect-square rounded-lg p-0.5 text-xs font-black tabular-nums transition',
              number === current ? 'ring-2 ring-ink ring-offset-1' : 'hover:opacity-80',
            ].join(' ')}
          >
            <Cell state={state}>{number}</Cell>
            {state === 'answered-marked' && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-answered text-[8px] leading-none text-white"
              >
                ✓
              </span>
            )}
          </button>
        ))}
      </div>

      {!compact && (
      <ul className="mt-4 space-y-1.5" aria-label="Palette legend">
        {(['answered', 'not-answered', 'marked', 'answered-marked', 'not-visited'] as PaletteState[]).map((s) => (
          <li key={s} className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span aria-hidden="true" className="relative h-4 w-4 shrink-0">
              <Cell state={s} />
              {s === 'answered-marked' && (
                <span className="absolute -right-1 -bottom-1 h-2 w-2 rounded-full border border-white bg-answered" />
              )}
            </span>
            <span>
              <span className="first-letter:uppercase">{LABEL[s]}</span>
              {AT_END[s] && <span className="text-ink-soft/80"> &rarr; {AT_END[s]}</span>}
            </span>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
