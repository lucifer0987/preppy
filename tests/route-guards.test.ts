import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Who may open which page, checked structurally.
 *
 * app/admin/layout.tsx guards the whole shell, but its own comment says why
 * that is not enough: a layout does not re-run on every navigation, so the
 * per-page check is where the guarantee actually lives. Two pages had lost it
 * before this test existed.
 */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = `${dir}/${e.name}`
    if (e.isDirectory()) return pages(full)
    return e.name === 'page.tsx' ? [full] : []
  })
}

const all = pages('app')
/**
 * Deliberately reachable signed out: the splash, the login form, and the
 * page the service worker shows when the network is gone.
 *
 * /offline has to render with no server, no session and no data -- that is
 * what it is for -- which is also why it can say nothing about anybody. A
 * guard on it would be a guard that could never run.
 */
const PUBLIC = new Set(['app/page.tsx', 'app/login/page.tsx', 'app/offline/page.tsx'])

describe('every page says who may open it', () => {
  it('found the pages to check', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  it('guards every admin page with requireAdmin, not just the layout', () => {
    const unguarded = all
      .filter((f) => f.startsWith('app/admin/'))
      .filter((f) => !/\brequireAdmin\s*\(/.test(readFileSync(f, 'utf8')))
    expect(unguarded).toEqual([])
  })

  it('guards every other non-public page with some check of its own', () => {
    const unguarded = all
      .filter((f) => !f.startsWith('app/admin/') && !PUBLIC.has(f))
      .filter((f) => !/\b(requireUser|requireAnySignedIn|requireAdmin|currentUser)\s*\(/
        .test(readFileSync(f, 'utf8')))
    expect(unguarded).toEqual([])
  })

  it('keeps the admin layout guarded as well, as the outer shell', () => {
    expect(readFileSync('app/admin/layout.tsx', 'utf8')).toMatch(/\brequireAdmin\s*\(/)
  })
})

describe("who may read somebody else's result", () => {
  const done = readFileSync('app/test/[attemptId]/done/page.tsx', 'utf8')

  /**
   * The result page used to be "yours or nothing": attempt.user_id !== user.id
   * meant a redirect, full stop. An admin now reads any of them, because the
   * question the console cannot answer from a table of nine numbers is "what
   * did the student actually see".
   *
   * That widening is the whole risk. A student reading another student's
   * result would be a leak of the cohort's scores before a paper closes, which
   * is the one thing FR-5.3 exists to prevent, so the role check is worth
   * pinning in place rather than trusting to have stayed.
   */
  it('lets an admin through and nobody else', () => {
    expect(done).toMatch(/const asAdmin = attempt\.user_id !== user\.id/)
    expect(done).toMatch(/if \(asAdmin && user\.role !== 'admin'\) redirect\('\/dashboard'\)/)
  })

  it('still refuses an attempt that does not exist', () => {
    expect(done).toMatch(/if \(!attempt\) redirect\('\/dashboard'\)/)
  })

  it("does not celebrate somebody else's score", () => {
    // Confetti and a fanfare belong to the person who earned it, and an admin
    // reading six results in a row wants neither.
    expect(done).toMatch(/\{!asAdmin && \(/)
  })

  it('does not send an admin into a running test', () => {
    // Opening the engine on another person's attempt would start a clock on
    // their paper.
    expect(done).toMatch(/if \(asAdmin\) redirect\(`\/admin\/attempts\?test=\$\{attempt\.test_id\}`\)/)
  })
})
