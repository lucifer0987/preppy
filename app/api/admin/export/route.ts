import { NextResponse } from 'next/server'
import { actionAdmin } from '../../../../lib/guard'
import { loadPublishedPapers } from '../../../../lib/repo/papers'
import { listTracks } from '../../../../lib/repo/tracks'
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
 * hatch that does not depend on Supabase still being there -- which is the
 * reason each paper carries its exam and the envelope carries every exam's
 * pattern. A bank you cannot rebuild from is not an escape hatch, and after
 * phase 3 a paper without its track is a paper whose shape is unknown.
 */
export async function GET() {
  if (!(await actionAdmin())) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  let papers
  let tracks
  try {
    const all = await listTracks()
    const byId = new Map(all.map((t) => [t.id, t]))
    tracks = all.map((t) => ({ slug: t.slug, name: t.name, isActive: t.isActive }))
    papers = (await loadPublishedPapers()).map((r) => ({
      id: r.id,
      // The exam it was written for. Without this a restored bank is a pile of
      // papers whose sections nothing can check.
      track: r.trackId ? byId.get(r.trackId)?.slug ?? null : null,
      status: r.status,
      publishedAt: r.publishedAt,
      rescoredAt: r.rescoredAt,
      paper: r.paper,
    }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), format: 'preppy-bank', version: 3, tracks, papers },
    null, 2,
  )

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="preppy-bank-${istDate()}.json"`,
    },
  })
}
