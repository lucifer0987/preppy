/**
 * Turn a JSON.parse failure into something an admin can act on.
 *
 * V8 has changed this message across Node versions: older builds append
 * "at position N", newer ones quote the offending snippet instead. Both are
 * handled, and either way the result names a line and column
 * so the admin can find the spot.
 */
export function describeJsonError(err: unknown, json: string): { message: string; excerpt?: string } {
  const raw = err instanceof Error ? err.message : String(err)

  const cleaned = raw
    .replace(/ in JSON at position \d+.*/, '')
    .replace(/ is not valid JSON$/, '')
    .trim()

  const pos = locate(raw, json)
  if (pos < 0) return { message: `${cleaned}.` }

  const before = json.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  const excerpt = json.slice(Math.max(0, pos - 60), pos + 60).replace(/\n/g, ' ')
  return { message: `${cleaned} at line ${line}, column ${col}.`, excerpt }
}

/** Find the byte offset the parser objected to, whichever message shape V8 used. */
function locate(raw: string, json: string): number {
  const byPosition = /position (\d+)/.exec(raw)
  if (byPosition) return Number(byPosition[1])

  // Newer V8 quotes the surrounding text instead:
  //   Unexpected token '}', ..."version": }" is not valid JSON
  const m = /(?:Unexpected token.*?,\s*)?(.+?)\s+is not valid JSON/.exec(raw)
  const snippet = m?.[1]
  if (!snippet) return -1

  // The snippet arrives wrapped in ellipses and quotes to varying degrees, so
  // try progressively tighter trims rather than guessing one exact shape.
  const seen = new Set<string>()
  let candidate = snippet.trim()
  for (let i = 0; i < 6; i++) {
    if (candidate.length >= 3 && !seen.has(candidate)) {
      seen.add(candidate)
      const at = json.indexOf(candidate)
      if (at >= 0) return at
    }
    const trimmed = candidate.replace(/^[.\s]+|[.\s]+$/g, '').replace(/^"|"$/g, '')
    if (trimmed === candidate) break
    candidate = trimmed
  }
  return -1
}
