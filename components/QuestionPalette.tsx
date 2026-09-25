'use client'

import type { OptionLabel } from '../lib/types'

/**
 * The question palette (FR-6.4.4).
 *
 * Shows only the current section: there is no route back to a finished one
 * (FR-6.4.2). At section end the grey cells become "not reached" and the red
 * ones "skipped", which is the distinction the result page reports.
 */
export type PaletteState = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked'

export function paletteState(
  visited: boolean, selected: OptionLabel | null, marked: boolean,
): PaletteState {
  if (marked) return selected ? 'answered-marked' : 'marked'
  if (selected) return 'answered'
  return visited ? 'not-answered' : 'not-visited'
}

const STYLE: Record<PaletteState, string> = {
  'not-visited': 'bg-notvisited text-ink',
  'not-answered': 'bg-notanswered text-white',
  answered: 'bg-answered text-white',
  marked: 'bg-marked text-white',
  'answered-marked': 'bg-marked text-white',
}

const LABEL: Record<PaletteState, string> = {
  'not-visited': 'not visited',
  'not-answered': 'not answered',
  answered: 'answered',
  marked: 'marked for review',
  'answered-marked': 'answered and marked for review',
}

export function QuestionPalette({
  states, current, onJump,
}: {
  states: { number: number; state: PaletteState }[]
  current: number
  onJump: (number: number) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">Question palette</p>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {states.map(({ number, state }) => (
          <button
            key={number}
            type="button"
            onClick={() => onJump(number)}
            aria-current={number === current ? 'true' : undefined}
            aria-label={`Question ${number}, ${LABEL[state]}`}
            className={[
              'relative aspect-square rounded-lg text-xs font-black tabular-nums transition',
              STYLE[state],
              number === current ? 'ring-2 ring-ink ring-offset-2' : 'hover:opacity-80',
            ].join(' ')}
          >
            {number}
            {state === 'answered-marked' && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full border border-white bg-answered"
              />
            )}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {(['answered', 'not-answered', 'marked', 'answered-marked', 'not-visited'] as PaletteState[]).map((s) => (
          <li key={s} className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded ${STYLE[s].split(' ')[0]}`} />
            <span className="capitalize">{LABEL[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
