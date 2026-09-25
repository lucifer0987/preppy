/**
 * One place that answers "may this animate?".
 *
 * Two rules, and both matter:
 *   - prefers-reduced-motion is honoured everywhere (PRD 8.4).
 *   - FR-8.1: nothing celebratory fires while a section timer is running. An
 *     animation over a Quant question costs marks, so celebration belongs at
 *     section end and on the result screen, never inside one.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const KAHOOT_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#7128bc', '#46178f']
