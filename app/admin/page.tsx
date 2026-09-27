import Link from 'next/link'
import { db } from '../../lib/supabase/admin'
import { formatIstDate, istDate, paperLabels, windowState } from '../../lib/time'
import { paperWindowOf } from '../../lib/repo/papers'
import { requireAdmin } from '../../lib/guard'
import { FinaliseButton } from './FinaliseButton'
import { Flash } from '../../components/Page'

/**
 * Admin home (PRD section 6.9).
 *
 * The first thing shown is whether tonight has a paper. That replaces the
 * publish-reminder cron dropped in v1.2: with no SMTP there is nowhere to send
 * a reminder, so the status lives where the admin already looks.
 */
/**
 * Authenticated and live-data backed: never prerender it.
 */
export const dynamic = 'force-dynamic'

export default async function AdminHome({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { password } = await searchParams
  const today = istDate()
  const { data: tonight } = await db()
    .from('tests').select('id, date, title, status, opens_at_min, entry_closes_at_min, attempt_sec').eq('date', today)
  const { count: userCount } = await db()
    .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')

  const now = new Date()
  // A day can hold more than one paper, so this is a list rather than a verdict.
  const papers = (tonight ?? [])
    .map((t) => ({
      id: t.id as string,
      title: (t.title as string | null) ?? null,
      status: t.status as string,
      window: paperWindowOf(t),
    }))
    .sort((a, b) => a.window.opensAtMin - b.window.opensAtMin)
  const anyScheduled = papers.some((p) => p.status === 'SCHEDULED')
  const good = anyScheduled

  return (
    <>
      {password === 'changed' && (
        <Flash tone="good" className="mb-4">
          Password changed.
        </Flash>
      )}

      {/* The console's headline. Not colour-coded green or red: a day with no
          paper on it is a state, not a fault, and a wall of red for one says
          something has gone wrong when nothing has. */}
      <section className="relative overflow-hidden rounded-card bg-surface-invert p-6 text-white
                          shadow-high sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06]"
               style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        </div>
        <div className="relative max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/60">
            Today &middot; <span className="numeral">{formatIstDate(today)}</span>
          </h1>
          <span className={[
            'chip border-transparent',
            good ? 'bg-good/25 text-white' : 'bg-white/15 text-white/80',
          ].join(' ')}>
            {good ? 'Scheduled' : 'Nothing scheduled'}
          </span>
        </div>

        {papers.length === 0 ? (
          <>
            <p className="mt-3 text-3xl font-black">No paper will unlock today</p>
            <p className="mt-1.5 text-white/70">
              Nobody&rsquo;s streak breaks for a day without a paper. Upload one and schedule it for
              whatever time suits.
            </p>
            <Link href="/admin/papers/upload" className="btn btn-invert mt-5 inline-flex">
              Upload a paper
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-3xl font-black">
              {papers.length} paper{papers.length === 1 ? '' : 's'} today
            </p>
            <ul className="mt-4 space-y-2">
              {papers.map((p) => {
                const l = paperLabels(p.window)
                const state = p.status === 'DRAFT' ? 'DRAFT' : windowState(p.window, now)
                return (
                  <li key={p.id}>
                    <Link href={`/admin/papers/${p.id}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control
                                     border border-white/15 bg-white/5 px-3.5 py-2.5 transition
                                     hover:border-white/35 hover:bg-white/10">
                      <span className="font-bold">{p.title ?? 'Untitled'}</span>
                      <span className="numeral text-sm text-white/70">{l.opens} &ndash; {l.closes}</span>
                      <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-[0.625rem]
                                       font-bold uppercase tracking-widest">
                        {stateWord(state)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        </div>
      </section>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Students" value={userCount ?? 0} />
        <Stat label="Papers published" value={<Published />} />
      </dl>

      <nav aria-label="Console" className="mt-8">
        <h2 className="eyebrow">Everything else</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile href="/admin/papers/upload" primary
                title="Upload a paper"
                body="Read it through, then schedule it for whatever time suits." />
          <Tile href="/admin/papers"
                title="All papers"
                body="Everything drafted or published. Correct a key, or dry-run one." />
          <Tile href="/admin/pattern"
                title="Paper pattern"
                body="Questions, minutes and marking per section." />
          <Tile href="/admin/window"
                title="Nightly window"
                body="The times a new paper is offered when you schedule it." />
          <Tile href="/admin/users"
                title="People"
                body="Accounts, passwords, and who is still active." />
          <Tile href="/admin/attempts"
                title="Attempts"
                body="Every attempt with its score and the two integrity counters." />
        </ul>
        <p className="mt-4 text-sm">
          <a href="/api/admin/export" className="font-semibold text-accent underline underline-offset-4">
            Export the question bank
          </a>{' '}
          <span className="text-ink-soft">
            &mdash; every published paper as one JSON file, for keeping somewhere that is not Supabase.
          </span>
        </p>
      </nav>

      <section className="mt-8 rounded-control bg-surface px-5 py-4">
        <h2 className="eyebrow">Nightly job</h2>
        <div className="mt-2">
          <FinaliseButton />
        </div>
      </section>

    </>
  )
}

/**
 * What the banner says about today's paper. A draft is not "nothing": it is
 * one click from going live, and saying "upload one" would send the admin to
 * redo work already done.
 */
/** A paper's state today, in a word. */
function stateWord(state: 'DRAFT' | ReturnType<typeof windowState>): string {
  switch (state) {
    case 'DRAFT': return 'draft'
    case 'BEFORE_OPEN': return 'scheduled'
    case 'OPEN': return 'live now'
    case 'ENTRY_CLOSED': return 'finishing'
    case 'CLOSED': return 'finished'
  }
}

async function Published() {
  const { count } = await db()
    .from('tests').select('*', { count: 'exact', head: true }).eq('status', 'SCHEDULED')
  return <>{count ?? 0}</>
}

/** Local to this page because it is a <dl>, which the shared Stat is not. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="numeral mt-1.5 text-2xl font-bold">{value}</dd>
    </div>
  )
}

/**
 * One destination, with a sentence saying what it is for.
 *
 * Six buttons in a row told you the names of six screens and nothing about them,
 * which is fine once you know the console and useless before that.
 */
function Tile({ href, title, body, primary = false }: {
  href: string; title: string; body: string; primary?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        className={[
          'group flex h-full flex-col rounded-card border p-4 transition',
          primary
            ? 'border-accent/40 bg-accent-soft hover:border-accent hover:shadow-float'
            : 'border-line bg-surface hover:border-accent/50 hover:shadow-float',
        ].join(' ')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={`font-display font-bold ${primary ? 'text-accent' : 'text-ink'}`}>
            {title}
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true"
               className="h-3.5 w-3.5 shrink-0 fill-ink-faint transition group-hover:fill-accent">
            <path d="M8.3 2.3a1 1 0 000 1.4L11.6 7H2a1 1 0 100 2h9.6l-3.3 3.3a1 1 0 101.4 1.4l5-5a1 1 0 000-1.4l-5-5a1 1 0 00-1.4 0z" />
          </svg>
        </span>
        <span className="mt-1.5 text-sm text-ink-soft">{body}</span>
      </Link>
    </li>
  )
}
