import {
  canStartAttempt, istDate, paperClosed, paperLabels, windowState, type PaperWindow,
} from '../../../lib/time'

/**
 * Why a student may not begin this paper now, or null if they may. Shared by
 * the briefing, which shows it instead of a Begin button, and by Begin
 * itself, which re-checks on the server (FR-4.1: a start at 23:15:00 is
 * refused server-side).
 */
export function entryRefusal(
  status: string, w: PaperWindow, now: Date = new Date(),
): string | null {
  if (status !== 'SCHEDULED') return 'That paper is not scheduled.'
  if (w.date !== istDate(now)) return 'That is not today\'s paper. A paper can only be taken on its own day.'
  if (canStartAttempt(w, now)) return null
  const { opens, closes } = paperLabels(w)
  if (windowState(w, now) === 'BEFORE_OPEN') return `This paper unlocks at ${opens}.`
  // An early end is named rather than dressed up as the clock: "entry closed
  // at 11:15 PM" is a lie when an admin stopped the paper at nine. Checked
  // after the opening time, because a stamp in the future has not happened.
  if (w.endedAt && now.getTime() >= Date.parse(w.endedAt)) {
    return 'This paper was ended early by your admin, so it can no longer be started.'
  }
  return `Entry for this paper closed at ${closes}.`
}

/**
 * Why a student may not practice this paper, or null if they may (PRD 6.11).
 *
 * A practice run is the archive made sittable: the same engine, the same
 * timers, no rank and no row on the board. It is offered on a paper that is
 * already open to you and on no other, which is the same gate the archive
 * itself uses -- you have finished it, or it has closed.
 *
 * That gate is the whole of the safety here. Practicing a paper you can still
 * sit for real would be sitting it twice, the second time knowing the
 * questions, and the counted attempt is the one that would be worth less for
 * it.
 */
export function practiceRefusal(
  status: string, w: PaperWindow, finished: boolean, now: Date = new Date(),
): string | null {
  if (status !== 'SCHEDULED') return 'That paper is not scheduled.'
  if (finished || paperClosed(w, now)) return null
  return canStartAttempt(w, now)
    ? 'You can still sit this paper for real, so there is nothing to practice yet.'
    : 'This paper has not closed yet, so its questions are not open to you.'
}
