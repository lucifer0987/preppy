import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { finaliseOverdueAttempts } from '../../../../lib/repo/finalise'

export const dynamic = 'force-dynamic'

/**
 * Runs twice a day, at 13:00 and 01:00 IST (07:30 and 19:30 UTC), scheduled in
 * vercel.json. Vercel Cron runs on UTC, which is why the file reads oddly.
 *
 * The 01:00 run catches everything from the day before: whatever its length, a
 * paper must finish inside its own IST day, because
 * `tests_window_within_the_day` forces entry close plus its running time to land
 * on or before midnight. The 13:00 run is there so a morning paper is not left
 * sitting off the leaderboard until the small hours -- no abandoned attempt
 * waits more than twelve hours for a sweep.
 *
 * Neither is the first line of defence. An abandoned attempt is also scored the
 * next time anyone opens it, and when that student starts another paper. And
 * the admin can run it on demand from /admin.
 *
 * Vercel Cron is the only caller: it presents CRON_SECRET as a bearer token.
 * A signed-in admin does not come through here. A cookie-authenticated GET is
 * exactly what a cross-site link or image tag can trigger, and this endpoint
 * writes scores, so the admin's manual run is a server action instead
 * (app/admin/finalise.ts, FR-10.3).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Without a secret the nightly job can never authenticate, so every open
    // attempt stays open until someone notices. Say so as loudly as possible.
    console.error(
      '[cron/finalise] CRON_SECRET is not set. The nightly finalise job cannot run; ' +
      'set it in the Vercel project settings. Refusing the request.',
    )
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured on the server, so the finalise job cannot run.' },
      { status: 500 },
    )
  }

  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 })
  }

  try {
    const report = await finaliseOverdueAttempts()
    if (report.failed.length) console.error('[cron/finalise] some attempts failed', report.failed)
    return NextResponse.json({ ok: true, ...report })
  } catch (e) {
    console.error('[cron/finalise] failed', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

/** Constant-time, so the secret cannot be recovered a byte at a time. */
function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
