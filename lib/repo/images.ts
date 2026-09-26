import 'server-only'
import { db } from '../supabase/admin'

/**
 * Paper images in Supabase Storage (see lib/images.ts for the rules).
 *
 * The bucket is private and created on first use, so setup has no extra step.
 * Files live at `<testId>/<name>`, which keeps each paper's images together and
 * lets deleting a paper delete its folder.
 */

const BUCKET = 'paper-images'

export const PAPER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A paper id becomes a storage folder by string interpolation, so anything that
 * is not a plain uuid must not get that far. The one caller reachable from
 * outside is the image route, whose admin branch skips the database lookup that
 * would otherwise have rejected it.
 */
function folder(testId: string): string {
  if (!PAPER_ID_PATTERN.test(testId)) throw new Error('That is not a paper id.')
  return testId
}

let bucketReady: Promise<void> | null = null

function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = db().storage
    const { data } = await storage.getBucket(BUCKET)
    if (data) return
    const { error } = await storage.createBucket(BUCKET, { public: false })
    // Two requests can race to create it; the loser's "already exists" is fine.
    if (error && !/exist/i.test(error.message)) throw new Error(`Could not create the image store: ${error.message}`)
  })().catch((e) => { bucketReady = null; throw e })
  return bucketReady
}

export interface ImageUpload {
  name: string
  type: string
  bytes: ArrayBuffer
}

export async function savePaperImages(testId: string, images: ImageUpload[]): Promise<void> {
  if (!images.length) return
  await ensureBucket()
  const storage = db().storage.from(BUCKET)
  for (const img of images) {
    const { error } = await storage.upload(`${folder(testId)}/${img.name}`, img.bytes, { contentType: img.type, upsert: true })
    if (error) throw new Error(`Could not store image "${img.name}": ${error.message}`)
  }
}

export async function readPaperImage(testId: string, name: string): Promise<Blob | null> {
  await ensureBucket()
  const { data, error } = await db().storage.from(BUCKET).download(`${folder(testId)}/${name}`)
  return error ? null : data
}

/** The file names stored for a paper, or null when Storage cannot be read. */
export async function listPaperImages(testId: string): Promise<string[] | null> {
  try {
    await ensureBucket()
    const { data, error } = await db().storage.from(BUCKET).list(folder(testId), { limit: 1000 })
    if (error) return null
    return (data ?? []).map((f) => f.name)
  } catch {
    return null
  }
}

/** Best effort: a leftover image is harmless, a failed paper delete is not. */
export async function deletePaperImages(testId: string): Promise<void> {
  try {
    await ensureBucket()
    const storage = db().storage.from(BUCKET)
    const { data } = await storage.list(folder(testId), { limit: 1000 })
    if (data?.length) await storage.remove(data.map((f) => `${folder(testId)}/${f.name}`))
  } catch {
    // Nothing to do: the paper row is already gone.
  }
}
