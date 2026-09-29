import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Escape sequences that are not escape sequences.
 *
 * A JSX attribute written as lede="... — ..." is raw text, not a
 * JavaScript string literal, so the six characters backslash-u-2-0-1-4 reach
 * the screen exactly as typed. It shipped once, on the one line of the papers
 * page a student reads first.
 *
 * Nothing catches it: it type-checks, it renders, and it only looks wrong to a
 * person. The same sequence inside a real string literal -- quotes in an
 * expression, or a template literal -- is fine and used all over this codebase,
 * which is exactly why the mistake is easy to make and hard to see.
 *
 * Only the attribute case is checked. The mirror-image trap -- an HTML entity
 * inside a string literal, where it stays as typed -- was written here too and
 * taken out again: telling a literal from JSX children with a regex produced a
 * false positive on the first file it met, and a test that cries wolf teaches
 * people to skip the output.
 */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const full = `${dir}/${e.name}`
    if (e.isDirectory()) return sources(full)
    return /\.tsx$/.test(e.name) ? [full] : []
  })
}

const files = [...sources('app'), ...sources('components')]

describe('text that reaches the screen', () => {
  it('found the files to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('has no \\u escape inside a JSX attribute, where it would render literally', () => {
    // A double-quoted attribute value: ="...", with no closing quote before
    // the sequence. Attributes written as {`...`} or {'...'} are real string
    // literals and are left alone.
    const bad: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/=\s*"[^"]*\\u[0-9a-fA-F]{4}/.test(line)) bad.push(`${f}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(bad).toEqual([])
  })
})
