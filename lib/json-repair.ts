/**
 * Recovers JSON from a PDF text layer.
 *
 * A PDF stores positioned glyphs, not a text file, so JSON pulled back out of
 * one arrives damaged in predictable ways. Every repair below corresponds to
 * something Word, Google Docs or a PDF renderer actually does:
 *
 *   1. Curly quotes      autocorrect turns " into a typographic pair
 *   2. Wrapped strings   a long value is broken across lines; JSON forbids that
 *   3. Page furniture    headers, footers and page numbers land outside the JSON
 *   4. Invisible glyphs  non-breaking spaces, soft hyphens, zero-width joiners
 *   5. Unicode minus     autocorrect turns -0.25 into the U+2212 minus sign
 *
 * Every repair is recorded, so the checker can tell the admin what it had to
 * fix rather than silently changing their paper.
 */

export interface Repair {
  kind: string
  count: number
  detail?: string
}

export interface RepairResult {
  json: string
  repairs: Repair[]
}

const CURLY_DOUBLE = /[“”„‟″〃]/g
const CURLY_SINGLE = /[‘’‚‛′]/g
const INVISIBLE = /[­​‌‍⁠﻿]/g
const NBSP = /[      ]/g
const UNICODE_MINUS = /−/g

export function repairJson(raw: string): RepairResult {
  const repairs: Repair[] = []
  const note = (kind: string, count: number, detail?: string) => {
    if (count > 0) repairs.push({ kind, count, ...(detail ? { detail } : {}) })
  }

  let s = raw.replace(/\r\n?/g, '\n')

  // ---- 4. invisible glyphs and exotic spaces
  const invisible = (s.match(INVISIBLE) ?? []).length
  s = s.replace(INVISIBLE, '')
  note('invisible-characters', invisible, 'soft hyphens / zero-width marks removed')

  const nbsp = (s.match(NBSP) ?? []).length
  s = s.replace(NBSP, ' ')
  note('non-breaking-spaces', nbsp, 'converted to ordinary spaces')

  // ---- 3. page furniture: keep only the outermost JSON object
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    const before = s.slice(0, Math.max(first, 0)).trim()
    const after = last === -1 ? '' : s.slice(last + 1).trim()
    const dropped = [before, after].filter(Boolean).length
    note('page-furniture', dropped, 'text outside the JSON object ignored (headers, footers, page numbers)')
  }
  if (first === -1 || last === -1 || last < first) {
    return { json: s.trim(), repairs }
  }
  s = s.slice(first, last + 1)

  // ---- 1. curly quotes
  // Double quotes are JSON delimiters, so these must be straightened.
  // Single quotes are not, but straightening them keeps text consistent.
  const cd = (s.match(CURLY_DOUBLE) ?? []).length
  s = s.replace(CURLY_DOUBLE, '"')
  note('curly-double-quotes', cd, 'straightened; these break JSON outright')

  const cs = (s.match(CURLY_SINGLE) ?? []).length
  s = s.replace(CURLY_SINGLE, "'")
  note('curly-single-quotes', cs, 'straightened')

  // ---- 5. unicode minus in numbers
  const um = (s.match(UNICODE_MINUS) ?? []).length
  s = s.replace(UNICODE_MINUS, '-')
  note('unicode-minus', um, 'replaced with ASCII hyphen')

  // ---- 2. strings broken across lines
  const joined = joinWrappedStrings(s)
  s = joined.text
  note('wrapped-strings', joined.count, 'line breaks inside string values rejoined')

  // ---- trailing commas, which humans add and JSON forbids
  const tc = (s.match(/,(\s*[}\]])/g) ?? []).length
  s = s.replace(/,(\s*[}\]])/g, '$1')
  note('trailing-commas', tc, 'removed')

  return { json: s, repairs }
}

/**
 * Walks the document tracking whether we are inside a string literal, and
 * splices out any newline that falls inside one.
 *
 * PDF renderers wrap at a space and drop it, so the two halves are rejoined
 * with a single space. Mid-word breaks effectively only happen with
 * hyphenation, which leaves a visible hyphen behind; that hyphen is left
 * alone because legitimate ones ("low-cost") are indistinguishable from it.
 */
function joinWrappedStrings(s: string): { text: string; count: number } {
  let out = ''
  let inString = false
  let escaped = false
  let count = 0

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!

    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\' && inString) { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }

    if (ch === '\n' && inString) {
      // Skip the indentation the renderer put on the continuation line.
      let j = i + 1
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++
      out = out.replace(/[ \t]+$/, '')
      const prev = out[out.length - 1] ?? ''
      const next = s[j] ?? ''
      if (prev !== '' && next !== '' && !/\s/.test(prev)) out += ' '
      i = j - 1
      count++
      continue
    }
    out += ch
  }
  return { text: out, count }
}


/**
 * Turn a JSON.parse failure into something an admin can act on.
 *
 * V8 has changed this message across Node versions: older builds append
 * "at position N", newer ones quote the offending snippet instead. Both are
 * handled, and either way the result names a line and column in the repaired
 * text so the admin can find the spot.
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
