/**
 * A section's own answer shape, used as its badge.
 *
 * The four shapes already carry option identity inside a paper, so a student
 * has been reading them all through the test. Reusing them for the sections
 * means the briefing, the result and the paper itself all name a section the
 * same way, without inventing a fifth visual language.
 */
export function SectionShape({ index, size = 'md' }: { index: number; size?: 'md' | 'lg' }) {
  const fill = ['var(--color-opt-red)', 'var(--color-opt-blue)',
                'var(--color-opt-yellow)', 'var(--color-opt-green)'][index % 4]
  const path = [
    'M8 1.5 14.5 13.5 1.5 13.5Z',
    'M8 1 15 8 8 15 1 8Z',
    'M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5Z',
    'M2 2h12v12H2Z',
  ][index % 4]
  const box = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7'
  const glyph = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  return (
    <span className={`${box} grid shrink-0 place-items-center rounded-control bg-surface-sunken`}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className={glyph}>
        <path d={path} fill={fill} />
      </svg>
    </span>
  )
}
