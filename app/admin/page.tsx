import Link from 'next/link'
import { db } from '../../lib/supabase/admin'
import { addDays, formatIstDate, istDate, paperLabels, windowState } from '../../lib/time'
import { paperWindowOf } from '../../lib/repo/papers'
import { requireAdmin } from '../../lib/guard'
import { Flash, StatusChip } from '../../components/Page'
import { FinaliseButton } from './FinaliseButton'

/**
 * The console home (PRD section 6.9).
 *
 * Rebuilt for density. It used to be a full-screen decorative panel, two
 * figures, and the six sections repeated as large tiles with a sentence each
 * -- the same list the rail already shows, taking a screen to say it. What an
 * admin opens this page to learn is whether today is covered, so that is the
 * first line, and the rest is counts and the three things they actually do.
 */
export const dynamic = 'force-dynamic'

export default async function AdminHome({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const { password } = await searchParams
  const today = istDate()

  const [todayRes, students, scheduled, drafts, attempts] = await Promise.all([
    /**
     * Yesterday and later, not today alone.
     *
     * A window may end after midnight (migration 0011), so at half past twelve
     * the paper that is running carries yesterday's date. Matching the date
     * exactly left this screen saying nothing was on while students were
     * sitting one -- on the page whose whole job is "what is happening now".
     * The rows are narrowed below to today's papers plus anything from
     * yesterday that has not closed.
     */
    db().from('tests')
      .select('id, date, title, status, track_id, opens_at_min, entry_closes_at_min, attempt_sec, ended_at, tracks(name)')
      .gte('date', addDays(today, -1)),
    db().from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    db().from('tests').select('*', { count: 'exact', head: true }).eq('status', 'SCHEDULED'),
    db().from('tests').select('*', { count: 'exact', head: true }).eq('status', 'DRAFT'),
    db().from('attempts').select('*', { count: 'exact', head: true })
      .eq('is_dry_run', false).in('state', ['SUBMITTED', 'AUTO_SUBMITTED']),
  ])

  const now = new Date()
  // A day can hold more than one paper, so this is a list rather than a verdict.
  const papers = (todayRes.data ?? [])
    .map((t) => ({
      id: t.id as string,
      title: (t.title as string | null) ?? null,
      status: t.status as string,
      // Today is today for every exam at once, so each row says which. With
      // one exam the column is the same word repeated, so it is left out.
      trackName: (t.tracks as unknown as { name: string } | null)?.name ?? null,
      window: paperWindowOf(t),
    }))
    // Today's, and yesterday's only while it is still going. A paper cannot
    // run 24 hours (tests_attempt_sec_sane caps it at eight), so one day back
    // is as far as this has to look.
    .filter((p) => p.window.date === today || windowState(p.window, now) !== 'CLOSED')
    .sort((a, b) => a.window.date.localeCompare(b.window.date)
      || a.window.opensAtMin - b.window.opensAtMin)
  const manyTracks = new Set(papers.map((p) => p.trackName)).size > 1

  return (
    <>
      {password === 'changed' && <Flash tone="good" className="mb-4">Password changed.</Flash>}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Console</p>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="numeral">{formatIstDate(today)}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/papers/upload" className="btn btn-primary px-4 py-2 text-sm">
            Upload a paper
          </Link>
          <Link href="/admin/papers" className="btn btn-quiet px-4 py-2 text-sm">All papers</Link>
        </div>
      </div>

      {/* Four figures on one line. Colour only where it means something: a
          draft is waiting on the admin, so it is the one that can go amber. */}
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        <Kpi label="Students" value={students.count ?? 0} />
        <Kpi label="Papers scheduled" value={scheduled.count ?? 0} />
        <Kpi label="Drafts waiting" value={drafts.count ?? 0} tone={(drafts.count ?? 0) > 0 ? 'warn' : 'plain'} />
        <Kpi label="Attempts counted" value={attempts.count ?? 0} />
      </dl>

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="eyebrow">Today</h2>
          {papers.length > 0 && (
            <p className="numeral text-xs text-ink-faint">
              {papers.length} paper{papers.length === 1 ? '' : 's'} on {formatIstDate(today)}
            </p>
          )}
        </div>

        {papers.length === 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border
                          border-dashed border-line-strong bg-surface-sunken px-4 py-3.5">
            <p className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">No paper will unlock today.</span>{' '}
              Nobody&rsquo;s streak breaks for a day without one.
            </p>
            <Link href="/admin/papers/upload"
                  className="ml-auto text-sm font-bold text-accent underline underline-offset-4">
              Upload one &rarr;
            </Link>
          </div>
        ) : (
          <ul className="mt-2 overflow-hidden rounded-card border border-line bg-surface">
            {papers.map((p) => {
              const l = paperLabels(p.window)
              const state = p.status === 'DRAFT' ? 'DRAFT'
            : p.window.endedAt ? 'ENDED'
            : windowState(p.window, now)
              return (
                <li key={p.id} className="border-b border-line last:border-0">
                  <Link href={`/admin/papers/${p.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition
                                   hover:bg-surface-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.title ?? 'Untitled'}</span>
                      {manyTracks && p.trackName && (
                        <span className="block truncate text-xs text-ink-faint">{p.trackName}</span>
                      )}
                    </span>
                    <span className="numeral shrink-0 text-sm text-ink-soft">{l.opens} &ndash; {l.closes}</span>
                    <StatusChip tone={chipTone(state)}>{stateWord(state)}</StatusChip>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="eyebrow">Unfinished attempts</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Anything still open past its hard stop is closed and scored. This runs on its own at
              1&nbsp;AM and 1&nbsp;PM; the button is the same sweep, now.
            </p>
          </div>
          <FinaliseButton />
        </div>
      </section>
    </>
  )
}

/** One figure. Cells share a hairline rather than each carrying a border. */
function Kpi({ label, value, tone = 'plain' }: {
  label: string; value: number; tone?: 'plain' | 'warn'
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={`numeral mt-0.5 text-2xl font-bold ${tone === 'warn' ? 'text-warn-ink' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/** A paper's state today, in a word. */
function stateWord(state: 'DRAFT' | 'ENDED' | ReturnType<typeof windowState>): string {
  switch (state) {
    case 'DRAFT': return 'draft'
    case 'ENDED': return 'ended early'
    case 'BEFORE_OPEN': return 'scheduled'
    case 'OPEN': return 'live now'
    case 'ENTRY_CLOSED': return 'finishing'
    case 'CLOSED': return 'finished'
  }
}

function chipTone(state: 'DRAFT' | 'ENDED' | ReturnType<typeof windowState>) {
  switch (state) {
    case 'DRAFT': return 'draft' as const
    case 'BEFORE_OPEN': return 'waiting' as const
    case 'OPEN': return 'live' as const
    default: return 'done' as const
  }
}
