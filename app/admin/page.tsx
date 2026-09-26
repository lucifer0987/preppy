import Link from 'next/link'
import { db } from '../../lib/supabase/admin'
import { formatIstDate, istDate, paperLabels, windowState } from '../../lib/time'
import { paperWindowOf } from '../../lib/repo/papers'
import { getWindow } from '../../lib/repo/settings'
import { requireAdmin } from '../../lib/guard'
import { FinaliseButton } from './FinaliseButton'

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
    .from('tests').select('id, date, title, status, opens_at_min, entry_closes_at_min').eq('date', today)
  const { count: userCount } = await db()
    .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')

  const testWindow = await getWindow()
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
        <p className="mb-4 rounded-2xl bg-answered px-5 py-4 font-semibold text-white">
          Password changed.
        </p>
      )}

      <section
        className={`rounded-3xl p-6 ${good ? 'bg-answered text-white' : 'bg-notanswered text-white'}`}
      >
        <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
          Today &middot; {formatIstDate(today)}
        </h1>

        {papers.length === 0 ? (
          <>
            <p className="mt-2 text-3xl font-black">Nothing scheduled</p>
            <p className="mt-1 text-white/80">
              No paper will unlock today. Upload one and schedule it for whatever time suits.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-black">
              {papers.length} paper{papers.length === 1 ? '' : 's'} today
            </p>
            <ul className="mt-3 space-y-2">
              {papers.map((p) => {
                const l = paperLabels(p.window)
                const state = p.status === 'DRAFT' ? 'DRAFT' : windowState(p.window, now)
                return (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={`/admin/papers/${p.id}`} className="font-bold underline">
                      {p.title ?? 'Untitled'}
                    </Link>
                    <span className="tabular-nums text-white/80">{l.opens} &ndash; {l.closes}</span>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                      {stateWord(state)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Students" value={userCount ?? 0} />
        <Stat label="Papers published" value={<Published />} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/papers/upload"
              className="rounded-2xl bg-play-purple px-5 py-3 font-black text-white transition hover:bg-play-purple-deep">
          Upload a paper
        </Link>
        <Link href="/admin/papers"
              className="rounded-2xl border-2 border-black/15 px-5 py-3 font-bold transition hover:border-black/30">
          All papers
        </Link>
        <Link href="/admin/window"
              className="rounded-2xl border-2 border-black/15 px-5 py-3 font-bold transition hover:border-black/30">
          Nightly window
        </Link>
        <Link href="/admin/users"
              className="rounded-2xl border-2 border-black/15 px-5 py-3 font-bold transition hover:border-black/30">
          People
        </Link>
        <Link href="/admin/attempts"
              className="rounded-2xl border-2 border-black/15 px-5 py-3 font-bold transition hover:border-black/30">
          Attempts
        </Link>
        <a href="/api/admin/export"
           className="rounded-2xl border-2 border-black/15 px-5 py-3 font-bold transition hover:border-black/30">
          Export question bank
        </a>
      </div>

      <section className="mt-8 rounded-2xl bg-white px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Nightly job</h2>
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4">
      <dt className="text-xs font-bold uppercase tracking-widest text-ink-soft">{label}</dt>
      <dd className="mt-1 text-3xl font-black tabular-nums">{value}</dd>
    </div>
  )
}
