import { actionUser } from '../../../../../lib/guard'
import { IMAGE_NAME_PATTERN, imageType } from '../../../../../lib/images'
import { db } from '../../../../../lib/supabase/admin'
import { PAPER_ID_PATTERN, readPaperImage } from '../../../../../lib/repo/images'
import { opensAt } from '../../../../../lib/time'
import { paperWindowOf } from '../../../../../lib/repo/papers'

/**
 * Serves a paper's image to someone allowed to see the paper.
 *
 * The admin sees any paper's images, for the preview and dry runs. Everyone
 * else only once a scheduled paper has opened, so a diagram can never
 * give a question away early. A student deactivated mid-test may still load
 * the images of the paper they are finishing (PRD §11).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ testId: string; name: string }> }) {
  const user = await actionUser({ allowInactive: true })
  if (!user) return new Response('Not signed in.', { status: 401 })

  const { testId, name } = await params
  const type = imageType(name)
  if (!IMAGE_NAME_PATTERN.test(name) || !type) return new Response('Not found.', { status: 404 })
  // Checked here so a malformed id is a plain 404 rather than an exception from
  // the storage layer, which guards the same thing one level down.
  if (!PAPER_ID_PATTERN.test(testId)) return new Response('Not found.', { status: 404 })

  if (user.role !== 'admin') {
    const { data: test } = await db().from('tests').select('date, status, opens_at_min, entry_closes_at_min, attempt_sec, ended_at').eq('id', testId).maybeSingle()
    const open = test && test.status === 'SCHEDULED'
      && Date.now() >= opensAt(paperWindowOf(test)).getTime()
    if (!open) return new Response('Not found.', { status: 404 })
  }

  const blob = await readPaperImage(testId, name)
  if (!blob) return new Response('Not found.', { status: 404 })

  return new Response(blob, {
    headers: {
      'Content-Type': type,
      // Per user, and never shared by a CDN: access depends on who is asking.
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
