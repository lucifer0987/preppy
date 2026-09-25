import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { finaliseOverdueAttempts } from '../../../../lib/repo/finalise'

export const dynamic = 'force-dynamic'

/**
 * Runs at 00:05 IST, scheduled in vercel.json.
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
