import { WINDOW, canStartAttempt, formatIstTime, istDate, windowState } from '../../../lib/time'

/**
 * Why a student may not begin this paper now, or null if they may. Shared by
 * the briefing, which shows it instead of a Begin button, and by Begin
 * itself, which re-checks on the server (FR-4.1: a start at 23:15:00 is
 * refused server-side).
 */
export function entryRefusal(status: string, date: string, now: Date = new Date()): string | null {
  if (status !== 'SCHEDULED') return 'That paper is not scheduled.'
  if (date !== istDate(now)) return 'That is not tonight\'s paper. A paper can only be taken on its own night.'
  if (canStartAttempt(date, now)) return null
  const opens = formatIstTime(WINDOW.openHour, WINDOW.openMinute)
  const closes = formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)
  return windowState(date, now) === 'BEFORE_OPEN'
    ? `Tonight's paper unlocks at ${opens}.`
    : `Entry for tonight closed at ${closes}.`
}
