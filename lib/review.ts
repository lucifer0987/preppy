/**
 * How one question went for one student, when they come back to read the paper.
 *
 * Four outcomes, and the distinction that matters most is the one between the
 * two kinds of unanswered: a question you looked at and moved on from is a
 * decision, and one the clock never let you see is not. The product has always
 * kept them apart (FR-6.3.3); this names them so the review screen can treat
 * them differently rather than lumping both under "no answer".
 *
 * Pure, and separate from the page, because the rule about which questions
 * keep their answer hidden is the kind of thing that should be checked rather
 * than read off a JSX expression.
 */
export type ReviewState =
  /** Answered, and it matched the key. */
  | 'correct'
  /** Answered, and it did not. */
  | 'wrong'
  /** Seen and left blank. A decision, and usually the interesting one. */
  | 'skipped'
  /** Never opened -- the section's time ran out first. */
  | 'unreached'
  /** This student did not sit the paper at all. */
  | 'unattempted'

export interface ResponseRow {
  selected: string | null
  visited: boolean
}

/**
 * `response` is undefined for a question with no row at all, which happens
 * when a section was never opened: the attempt has no record of it either way,
 * and that reads the same as reaching the end of the clock.
 */
export function reviewState(
  response: ResponseRow | undefined,
  answer: string,
  sat: boolean,
): ReviewState {
  if (!sat) return 'unattempted'
  if (!response || !response.visited) return 'unreached'
  if (response.selected === null) return 'skipped'
  return response.selected === answer ? 'correct' : 'wrong'
}

/**
 * Whether the key stays sealed until the reader asks for it.
 *
 * The point is to leave a question you did not answer worth attempting a
 * second time. Showing the key beside a blank answer turns revision into
 * reading, and the student never finds out whether they could have got it.
 *
 * A question you answered is not sealed either way: right or wrong, you have
 * already committed, and the key is the thing you came back for.
 *
 * `unattempted` is not sealed. Somebody browsing a paper they never sat is
 * reading it as a worked solution, and making them click through every
 * question to see any of it would be a worse screen for no gain -- they made
 * no attempt to protect.
 */
export function answerIsSealed(state: ReviewState): boolean {
  return state === 'skipped' || state === 'unreached'
}

/** How the state is named to the student, and the tone it is shown in. */
export const REVIEW_LABEL: Record<ReviewState, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  skipped: 'Skipped',
  unreached: 'Not reached',
  unattempted: 'Not sat',
}

/** Counts for the strip above the questions. */
export function tally(states: ReviewState[]): Record<ReviewState, number> {
  const out: Record<ReviewState, number> = {
    correct: 0, wrong: 0, skipped: 0, unreached: 0, unattempted: 0,
  }
  for (const s of states) out[s] += 1
  return out
}
