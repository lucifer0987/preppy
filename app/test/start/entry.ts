import { canStartAttempt, istDate, paperLabels, windowState, type PaperWindow } from '../../../lib/time'

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
  return windowState(w, now) === 'BEFORE_OPEN'
    ? `This paper unlocks at ${opens}.`
    : `Entry for this paper closed at ${closes}.`
}
