import { REVIEW_LABEL, type ReviewState } from '../lib/review'
import type { OptionLabel } from '../lib/types'

/**
 * The card's own edge carries the outcome, so the state is legible while
 * scrolling rather than only when you stop to read the badge. Kept to the
 * border colour: a filled band per card would make a page of fifty-five
 * questions read as an error log.
 */
/** The strip's figures. Muted for the two that are not a score. */
export const COUNT_TONE: Record<string, string> = {
  correct: 'text-good-ink', wrong: 'text-bad-ink',
  skipped: 'text-warn-ink', unreached: 'text-ink-faint',
}

export const RING: Record<ReviewState, string> = {
  correct: 'border-good/40',
  wrong: 'border-bad/40',
  skipped: 'border-warn/45',
  unreached: 'border-line',
  unattempted: '',
}

const TONE: Record<ReviewState, string> = {
  correct: 'border-good/35 bg-good/10 text-good-ink',
  wrong: 'border-bad/35 bg-bad/10 text-bad-ink',
  skipped: 'border-warn/40 bg-warn/10 text-warn-ink',
  unreached: 'border-line-strong bg-surface-sunken text-ink-faint',
  unattempted: 'border-line bg-surface-sunken text-ink-faint',
}

/**
 * What happened on this question, said once and in one place.
 *
 * It used to be a line of small uppercase grey text that read the same
 * whatever the outcome was, so telling a right answer from a missed one meant
 * reading the sentence. The word now carries a colour and a shape, and the
 * sentence after it says the thing the word cannot: which option you chose,
 * and -- for a question still sealed -- that the key is waiting rather than
 * missing.
 */
export function ReviewBadge({ state, answer, chose, seconds }: {
  state: ReviewState
  answer: OptionLabel
  chose: OptionLabel | null
  seconds: number
}) {
  const said =
    state === 'correct' ? `You chose ${chose}.`
      : state === 'wrong' ? `You chose ${chose}; the answer is ${answer}.`
      : state === 'skipped' ? 'You saw this one and moved on.'
      : state === 'unreached' ? 'The section\u2019s time ran out before this one.'
      : null

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className={`chip ${TONE[state]}`}>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3 fill-current">
          {state === 'correct'
            ? <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z" />
            : state === 'wrong'
              ? <path d="M15.7 4.3a1 1 0 0 1 0 1.4L11.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 0 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 1.4-1.4L10 8.6l4.3-4.3a1 1 0 0 1 1.4 0z" />
              : <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 12H9v-2h2zm0-3.5H9V5h2z" />}
        </svg>
        {REVIEW_LABEL[state]}
      </span>
      {said && <span className="text-sm text-ink-soft">{said}</span>}
      {seconds > 0 && (
        <span className="numeral ml-auto text-xs text-ink-faint">{clock(seconds)} spent</span>
      )}
    </div>
  )
}

/** Seconds as m:ss. */
function clock(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
