/**
 * The mark.
 *
 * The product already has a device: the four answer shapes, which carry option
 * identity independently of colour everywhere in the test. Using them as the
 * logo means the brand and the accessibility rule are the same decision rather
 * than two, and a student who has sat one paper recognises it instantly.
 *
 * Drawn as SVG rather than imported, so it is one file, scales cleanly, and
 * takes the theme with it.
 */
export function Wordmark({ tone = 'default', size = 'md' }: {
  tone?: 'default' | 'invert'
  size?: 'sm' | 'md'
}) {
  const invert = tone === 'invert'
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const type = size === 'sm' ? 'text-lg' : 'text-2xl'

  return (
    <span className="inline-flex items-center gap-2.5 align-middle">
      <span
        className={`${box} grid shrink-0 place-items-center rounded-[0.7rem] shadow-low`}
        style={{ background: invert ? 'rgba(255,255,255,0.12)' : 'var(--color-brand-800)' }}
      >
        <Shapes />
      </span>
      <span
        className={`font-display ${type} font-black tracking-tight ${invert ? 'text-white' : 'text-ink'}`}
      >
        Preppy
      </span>
    </span>
  )
}

/** The four shapes, 2x2, in their own colours. */
function Shapes() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[62%] w-[62%]">
      {/* A: triangle, red */}
      <path d="M5.5 1.5 L10.5 10 L0.5 10 Z" fill="var(--color-opt-red)" />
      {/* B: diamond, blue */}
      <path d="M18.5 1 L23.5 5.75 L18.5 10.5 L13.5 5.75 Z" fill="var(--color-opt-blue)" />
      {/* C: circle, yellow */}
      <circle cx="5.5" cy="18.5" r="5" fill="var(--color-opt-yellow)" />
      {/* D: square, green */}
      <rect x="13.5" y="13.5" width="10" height="10" rx="1.6" fill="var(--color-opt-green)" />
    </svg>
  )
}
