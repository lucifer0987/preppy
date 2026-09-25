import { NextResponse } from 'next/server'
import { actionAdmin } from '../../../../lib/guard'
import { loadPublishedPapers } from '../../../../lib/repo/papers'
import { istDate } from '../../../../lib/time'

export const dynamic = 'force-dynamic'

/**
 * FR-6.9.5: the whole question bank as JSON — "every test ever published".
 *
 * Drafts are left out: they were never published and may be half-finished.
 * Each entry carries its database id, status and rescore time alongside the
 * paper itself, which stays in the upload format so it can be checked or
 * re-uploaded as it is.
 *
 * The database is the system of record (FR-9.2); this is the manual escape
 * hatch that does not depend on Supabase still being there.
 */
export async function GET() {
  if (!(await actionAdmin())) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  let papers
  try {
    papers = (await loadPublishedPapers()).map((r) => ({
      id: r.id, status: r.status, publishedAt: r.publishedAt, rescoredAt: r.rescoredAt, paper: r.paper,
    }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), format: 'preppy-bank', version: 2, papers },
    null, 2,
  )

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="preppy-bank-${istDate()}.json"`,
    },
  })
}
