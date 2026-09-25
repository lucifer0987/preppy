import { NextResponse } from 'next/server'
import { currentUser } from '../../../../lib/auth'
import { listPapers, getPaperById } from '../../../../lib/repo/papers'
import { istDate } from '../../../../lib/time'

export const dynamic = 'force-dynamic'

/**
 * FR-6.9.5: the whole question bank as JSON.
 *
 * The database is the system of record (FR-9.2); this is the manual escape
 * hatch that does not depend on Supabase still being there.
 */
export async function GET() {
  const user = await currentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const summaries = await listPapers()
  const papers = []
  for (const s of summaries) {
    const record = await getPaperById(s.id)
    if (record) papers.push(record.paper)
  }

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), format: 'preppy-bank', version: 1, papers },
    null, 2,
  )

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="preppy-bank-${istDate()}.json"`,
    },
  })
}
