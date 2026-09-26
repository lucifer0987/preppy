import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * FR-13.1: the answer key never reaches the browser mid-test.
 *
 * The defence is that the live path never selects the columns, so no component
 * can leak what it was never given. That is a property of a few strings in
 * lib/repo/attempts.ts, which is easy to undo by adding one column to a select
 * while chasing something else -- and a leaked key would not look like a bug
 * until the leaderboard was already worthless.
 */
const attempts = readFileSync('lib/repo/attempts.ts', 'utf8')

/** Every `.select('...')` literal in a file, with its line number. */
function selects(src: string): { line: number; cols: string }[] {
  const out: { line: number; cols: string }[] = []
  src.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\.select\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      out.push({ line: i + 1, cols: m[1]! })
    }
  })
  return out
}

describe('the answer key stays on the server', () => {
  it('finds the selects it means to check', () => {
    expect(selects(attempts).length).toBeGreaterThan(4)
  })

  it('never asks for correct_option or solution anywhere on the attempt path', () => {
    // Scoring reads the key through getPaperById, on the server, after the
    // attempt is over. Nothing in the live path needs it.
    const leaks = selects(attempts)
      .filter((s) => /\b(correct_option|solution)\b/.test(s.cols))
      .map((s) => `lib/repo/attempts.ts:${s.line}`)
    expect(leaks).toEqual([])
  })

  it('keeps the key out of the type the browser is handed', () => {
    const iface = attempts.match(/export interface LiveQuestion \{[^}]*\}/s)?.[0] ?? ''
    expect(iface).not.toMatch(/answer|correct|solution/i)
  })

  it('lets a client component import types from the data layer, but never values', () => {
    // The other half of the rule. `import type` is erased before anything is
    // bundled, so a client file may name AttemptSnapshot; a value import would
    // pull the server module -- and the secret key with it -- into the browser.
    // Writing it as `import type` rather than `import { type X }` also
    // keeps it safe if verbatimModuleSyntax is ever turned on, which would make
    // the second form emit a real runtime import.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [])

    const offenders: string[] = []
    for (const f of [...walk('app'), ...walk('components')]) {
      const src = readFileSync(f, 'utf8')
      if (!/^['"]use client['"]/m.test(src)) continue
      // Line by line: these imports carry no semicolons, so a pattern allowed
      // to cross newlines swallows every import above the one it matches.
      for (const line of src.split('\n')) {
        const m = /^import\s[^\n]*?from\s+'([^']*lib\/(?:repo|supabase)\/[^']*)'/.exec(line)
        if (m && !/^import\s+type\s/.test(line)) offenders.push(`${f} -> ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
