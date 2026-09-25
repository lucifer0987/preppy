import { NextResponse, type NextRequest } from 'next/server'
import { finaliseOverdueAttempts } from '../../../../lib/repo/finalise'
import { currentUser } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Runs at 00:05 IST, scheduled in vercel.json.
 *
 * Two callers are allowed: Vercel Cron, which presents CRON_SECRET, and a
 * signed-in admin pressing the manual button. Anything else is refused,
 * because this endpoint writes scores.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const fromCron = Boolean(secret) && auth === `Bearer ${secret}`

  if (!fromCron) {
    const user = await currentUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
    }
  }

  try {
    const report = await finaliseOverdueAttempts()
    return NextResponse.json({ ok: true, ...report })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
