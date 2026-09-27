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
