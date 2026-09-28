import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { withoutIds } from '../components/Analytics'

/**
 * Web Analytics stores the URL of every page view, and Preppy's URLs carry
 * uuids. At six people, a city, a device and an attempt id together are not
 * anonymous in any way that matters, so the ids are stripped before the event
 * leaves the browser.
 *
 * The rule is one regular expression, which is exactly the kind of thing that
 * looks right and is not.
 */
describe('ids never leave in a page view', () => {
  it('replaces the id in every url shape this app produces', () => {
    const cases: [string, string][] = [
      ['/archive/37a7d6b7-7c06-4c6a-ac23-2e77966e00ef', '/archive/[id]'],
      ['/test/6225f300-255a-4b44-81ab-d825e830249d', '/test/[id]'],
      ['/test/6225f300-255a-4b44-81ab-d825e830249d/done', '/test/[id]/done'],
      ['/admin/papers/0bd75b2c-334a-47d6-8866-d961eb9895fd', '/admin/papers/[id]'],
      ['/admin/papers/0bd75b2c-334a-47d6-8866-d961eb9895fd/manage', '/admin/papers/[id]/manage'],
      ['/api/images/0bd75b2c-334a-47d6-8866-d961eb9895fd/chart.png', '/api/images/[id]/chart.png'],
      ['/test/start?test=0bd75b2c-334a-47d6-8866-d961eb9895fd', '/test/start?test=[id]'],
    ]
    for (const [before, after] of cases) expect(withoutIds(before), before).toBe(after)
  })

  it('catches an uppercase id, since a url is not required to be lower case', () => {
    expect(withoutIds('/archive/37A7D6B7-7C06-4C6A-AC23-2E77966E00EF')).toBe('/archive/[id]')
  })

  it('replaces every id when a url carries more than one', () => {
    const two = '/a/37a7d6b7-7c06-4c6a-ac23-2e77966e00ef/b/6225f300-255a-4b44-81ab-d825e830249d'
    expect(withoutIds(two)).toBe('/a/[id]/b/[id]')
  })

  it('leaves a url with no id exactly as it is', () => {
    for (const url of ['/dashboard', '/leaderboard?window=30', '/admin/users', '/']) {
      expect(withoutIds(url)).toBe(url)
    }
  })

  it('does not mistake a long word or a date for an id', () => {
    expect(withoutIds('/archive/2026-09-28')).toBe('/archive/2026-09-28')
    expect(withoutIds('/admin/papers/daily-mock-001')).toBe('/admin/papers/daily-mock-001')
  })
})

describe('both Vercel scripts are production-only', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8')

  it('renders Analytics only in a production build', () => {
    // Off Vercel the library falls back to a cross-origin debug script, and a
    // development day would make that request on every page load.
    expect(layout).toContain("process.env.NODE_ENV === 'production' && <Analytics />")
  })

  it('goes through the wrapper, never the package directly', () => {
    // Rendering @vercel/analytics straight from the layout would send the raw
    // url, ids and all, and nothing would fail to say so.
    expect(layout).toContain("from '../components/Analytics'")
    expect(layout).not.toMatch(/from '@vercel\/analytics/)
  })
})
