/**
 * Images for DI sets, puzzles and diagrams (FR-6.9.1).
 *
 * A paper names its images in `images`; the files are uploaded with it and
 * kept in a private Storage bucket under the paper's id. The browser never
 * reads Storage directly: it asks /api/images, which checks who is asking and
 * whether the paper is open yet, so a diagram cannot leak a question early.
 *
 * Pure and client-safe, so the display components can build URLs.
 */

/** File names become Storage keys and URL segments, so keep them plain. */
export const IMAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|webp|gif)$/i

export const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function imageType(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_TYPES[ext] ?? null
}

export function imageUrl(testId: string, name: string): string {
  return `/api/images/${encodeURIComponent(testId)}/${encodeURIComponent(name)}`
}
