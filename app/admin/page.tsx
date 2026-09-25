import Link from 'next/link'
import { db } from '../../lib/supabase/admin'
import { WINDOW, formatIstDate, formatIstTime, istDate, windowState } from '../../lib/time'
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
    .from('tests').select('id, date, title, status').eq('date', today).maybeSingle()
  const { count: userCount } = await db()
    .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')

  const status = tonightStatus(tonight?.status as string | undefined, windowState(today))
  const good = status.tone === 'good'

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
          Tonight &middot; {formatIstDate(today)}
        </h1>
        <p className="mt-2 text-3xl font-black">{status.headline}</p>
        <p className="mt-1 text-white/80">
          {tonight?.title ? `${tonight.title}. ` : ''}{status.detail}
        </p>
        {tonight && (
          <Link href={`/admin/papers/${tonight.id}`} className="mt-3 inline-block text-sm font-bold underline">
            {tonight.status === 'DRAFT' ? 'Preview and schedule it' : 'Open the paper'}
          </Link>
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
function tonightStatus(
  status: string | undefined,
  state: ReturnType<typeof windowState>,
): { headline: string; detail: string; tone: 'good' | 'bad' } {
  if (!status) {
    return state === 'BEFORE_OPEN'
      ? { headline: 'Not scheduled', detail: 'No paper will unlock tonight. Upload one before 10 PM.', tone: 'bad' }
      : { headline: 'No paper tonight', detail: 'Nothing ran tonight. Streaks are not broken by it.', tone: 'bad' }
  }
  if (status === 'DRAFT') {
    return state === 'BEFORE_OPEN'
      ? { headline: 'Draft awaiting schedule', detail: 'Tonight\'s paper is uploaded but will not unlock until you schedule it before 10 PM.', tone: 'bad' }
      : { headline: 'Draft, never scheduled', detail: 'Tonight\'s paper stayed a draft, so nothing unlocked.', tone: 'bad' }
  }
  switch (state) {
    case 'BEFORE_OPEN': return { headline: 'Scheduled', detail: 'Paper ready to go.', tone: 'good' }
    case 'OPEN': return { headline: 'Live now', detail: `Open until ${formatIstTime(WINDOW.entryCloseHour, WINDOW.entryCloseMinute)}.`, tone: 'good' }
    case 'ENTRY_CLOSED': return { headline: 'Finishing', detail: `Entry has closed; running attempts end by ${formatIstTime(WINDOW.hardStopHour, WINDOW.hardStopMinute)}.`, tone: 'good' }
    case 'CLOSED': return { headline: 'Finished', detail: 'Tonight\'s paper has run.', tone: 'good' }
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
