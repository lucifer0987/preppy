/**
 * One place that answers "may this animate?".
 *
 * Two rules, and both matter:
 *   - prefers-reduced-motion is honoured everywhere (PRD 8.4).
 *   - FR-8.1: nothing celebratory fires while a section timer is running. An
 *     animation over a Quant question costs marks, so celebration belongs on
 *     the result screen only. There is none between sections.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const KAHOOT_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#7128bc', '#46178f']

/**
 * True the first time it is asked about a given key in this browser, false
 * after. The result page uses it so confetti and sound mark the moment of
 * submitting, not every later visit to the same result.
 *
 * Call it at the moment of firing, not when an effect is scheduled: React's
 * development double-mount would otherwise claim the key on a run that is
 * then cancelled. If storage is unavailable it answers true, so the worst case
 * is a repeat celebration rather than none.
 */
export function claimFirstView(key: string): boolean {
  if (typeof window === 'undefined') return false
  const k = `preppy.seen.${key}`
  try {
    if (window.localStorage.getItem(k)) return false
    window.localStorage.setItem(k, '1')
  } catch {
    // Unavailable storage: treat every visit as the first.
  }
  return true
}
