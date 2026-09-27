import Link from 'next/link'

/**
 * The pieces every inner page was drawing by hand.
 *
 * Each of these screens had its own idea of how big a title is, how far the lede
 * sits from it, and where the actions go. That inconsistency is most of what
 * makes an application feel assembled rather than built, and it is invisible
 * while you are looking at one page at a time.
 */

/** The way back. Small, quiet, always in the same place. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft
                 transition hover:text-accent"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
        <path d="M7.7 2.3a1 1 0 010 1.4L4.4 7H14a1 1 0 110 2H4.4l3.3 3.3a1 1 0 11-1.4 1.4l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 0z" />
      </svg>
      {children}
    </Link>
  )
}

/**
 * Title, one line of orientation, and whatever actions belong to the page.
 *
 * `lede` is a sentence, not a label: on a screen you land on once a week, the
 * useful thing is what it is for, not a restatement of the title.
 */
export function PageHeader({ title, lede, actions, meta }: {
  title: React.ReactNode
  lede?: React.ReactNode
  actions?: React.ReactNode
  /** A line under the title for counts, dates, status. */
  meta?: React.ReactNode
}) {
  return (
    <header className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {meta && <div className="mt-1.5 text-sm text-ink-soft">{meta}</div>}
        {lede && <p className="mt-2 max-w-2xl text-ink-soft">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  )
}

/** One figure with its name. Reads as a figure: mono, tabular, large. */
export function Stat({ label, value, hint, tone = 'default' }: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'good' | 'bad' | 'accent' | 'zap'
}) {
  // The -ink variants throughout: a fill colour is too light to read as a
  // figure on a card in light mode.
  const colour = {
    default: 'text-ink', good: 'text-good-ink', bad: 'text-bad-ink',
    accent: 'text-accent', zap: 'text-zap-ink',
  }[tone]
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className={`numeral mt-1.5 text-2xl font-bold ${colour}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}

/** A row of figures that wraps rather than squeezing. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

/**
 * A table that scrolls sideways rather than making the page do it, with the
 * header treatment used on the leaderboard so the two look related.
 */
export function TableShell({ children, minWidth = '40rem' }: {
  children: React.ReactNode; minWidth?: string
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  )
}

export function Th({ children, align = 'left', className = '' }: {
  children?: React.ReactNode; align?: 'left' | 'right'; className?: string
}) {
  return (
    <th scope="col"
        className={`px-3 py-2.5 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-faint
                    ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  )
}

/** Nothing here yet, said without looking like a fault. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-line-strong bg-surface-sunken
                  p-7 text-center text-ink-soft">
      {children}
    </p>
  )
}

/** A short status word. The word carries it; colour only reinforces. */
export function StatusChip({ tone, children }: {
  tone: 'live' | 'done' | 'waiting' | 'draft' | 'good' | 'bad'
  children: React.ReactNode
}) {
  // The -ink variants, not --good/--bad themselves: the fill colours are too
  // light to read as words on a wash of themselves in light mode.
  const look = {
    live: 'border-bad/30 bg-bad/10 text-bad-ink',
    done: 'border-line bg-surface-sunken text-ink-soft',
    waiting: 'border-accent/30 bg-accent-soft text-accent',
    draft: 'border-line bg-surface-sunken text-ink-faint',
    good: 'border-good/30 bg-good/10 text-good-ink',
    bad: 'border-bad/30 bg-bad/10 text-bad-ink',
  }[tone]
  return <span className={`chip ${look}`}>{children}</span>
}

/**
 * The line a page shows after something happened.
 *
 * This was hand-rolled in fourteen files as a solid green or red bar with white
 * text, each with its own padding and corner radius. A saved form is not an
 * emergency, and a full-bleed red bar for "that date already has a paper" reads
 * like one, so these are washes with the message in the status colour.
 *
 * `tone` also picks the ARIA role: a failure interrupts a screen reader, a
 * confirmation waits its turn.
 */
export function Flash({ tone, children, className = '' }: {
  tone: 'good' | 'bad' | 'warn' | 'info'
  children: React.ReactNode
  /** Only for the margin the calling page needs. */
  className?: string
}) {
  const look = {
    good: 'border-good/35 bg-good/10 text-good-ink',
    bad: 'border-bad/35 bg-bad/10 text-bad-ink',
    warn: 'border-warn/35 bg-warn/10 text-warn-ink',
    info: 'border-accent/35 bg-accent-soft text-accent',
  }[tone]
  return (
    <p
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-control border px-4 py-3 font-semibold ${look} ${className}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-current">
        {tone === 'good'
          ? <path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm4 6.2l-4.8 6a1 1 0 01-1.5.06L5.4 11.2a1 1 0 011.45-1.38l1.6 1.68 4.03-5.04A1 1 0 0114 7.7z" />
          : tone === 'bad' || tone === 'warn'
            ? <path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM9 5.5h2v6H9v-6zm0 7.5h2v2H9v-2z" />
            : <path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM9 5h2v2H9V5zm0 3.5h2v6H9v-6z" />}
      </svg>
      <span>{children}</span>
    </p>
  )
}
