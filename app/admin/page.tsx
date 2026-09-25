import Link from 'next/link'
import { db } from '../../lib/supabase/admin'
import { formatIstDate, istDate } from '../../lib/time'

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

export default async function AdminHome() {
  const today = istDate()
  const { data: tonight } = await db()
    .from('tests').select('id, date, title, status').eq('date', today).maybeSingle()
  const { count: userCount } = await db()
    .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')

  const scheduled = tonight?.status === 'SCHEDULED'

  return (
    <>
      <section
        className={`rounded-3xl p-6 ${scheduled ? 'bg-answered text-white' : 'bg-notanswered text-white'}`}
      >
        <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
          Tonight &middot; {formatIstDate(today)}
        </h1>
        <p className="mt-2 text-3xl font-black">{scheduled ? 'Scheduled' : 'Not scheduled'}</p>
        <p className="mt-1 text-white/80">
          {scheduled
            ? tonight?.title ?? 'Paper ready to go.'
            : 'No paper will unlock tonight. Upload one before 10 PM.'}
        </p>
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
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Still to come</h2>
        {[
          ['Dry run', 'Take any paper yourself in the real engine. Never counted, never ranked.'],
          ['Manage users', 'Create accounts, reset passwords, deactivate.'],
          ['Attempts', 'Every attempt with its score, duration and two integrity counters.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border-2 border-dashed border-black/10 px-5 py-4">
            <p className="font-bold">{title}</p>
            <p className="text-sm text-ink-soft">{body}</p>
          </div>
        ))}
      </section>
    </>
  )
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
