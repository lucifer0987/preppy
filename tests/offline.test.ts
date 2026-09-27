import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * What the service worker is allowed to keep (PRD 6.12).
 *
 * These read the shipped public/sw.js rather than a copy of its rules, because
 * the rule that matters here is a security property and a test of a duplicate
 * would pass while the real file drifted.
 *
 * The property: a paper being sat is never served from a cache. Its clock
 * belongs to the server, and a timer read from a cache is the wrong timer.
 */

const sw = readFileSync('public/sw.js', 'utf8')

/** Pull a regex literal back out of the worker, so these test the real one. */
function rule(name: string): RegExp {
  const m = sw.match(new RegExp(`const ${name} = (/.*/)\\n`))
  if (!m) throw new Error(`${name} is not in public/sw.js any more`)
  // eslint-disable-next-line no-eval
  return eval(m[1]!) as RegExp
}

const CACHEABLE_PAGE = rule('CACHEABLE_PAGE')
const CACHEABLE_ASSET = rule('CACHEABLE_ASSET')
const IMMUTABLE = rule('IMMUTABLE')

const cacheable = (path: string) =>
  CACHEABLE_PAGE.test(path) || CACHEABLE_ASSET.test(path) || IMMUTABLE.test(path)

describe('what may be kept offline', () => {
  it('keeps the archive, which is the point of it', () => {
    expect(cacheable('/archive')).toBe(true)
    expect(cacheable('/archive/6f3a-1111')).toBe(true)
  })

  it('keeps a paper’s images, which the archive needs to be readable', () => {
    expect(cacheable('/api/images/6f3a-1111/di-chart-1.png')).toBe(true)
  })

  it('keeps the content-hashed assets a cached page renders with', () => {
    expect(cacheable('/_next/static/chunks/main-abc123.js')).toBe(true)
  })
})

describe('what may never be kept', () => {
  it('never keeps a paper being sat', () => {
    // The whole reason the scope is a whitelist rather than a blacklist.
    expect(cacheable('/test/6f3a-1111')).toBe(false)
    expect(cacheable('/test/start')).toBe(false)
    expect(cacheable('/test/6f3a-1111/done')).toBe(false)
  })

  it('never keeps anything that moves through the day', () => {
    expect(cacheable('/dashboard')).toBe(false)
    expect(cacheable('/leaderboard')).toBe(false)
  })

  it('never keeps the console, or an account', () => {
    expect(cacheable('/admin')).toBe(false)
    expect(cacheable('/admin/papers/6f3a-1111')).toBe(false)
    expect(cacheable('/account')).toBe(false)
    expect(cacheable('/login')).toBe(false)
  })

  it('never keeps the question bank or the cron endpoint', () => {
    expect(cacheable('/api/admin/export')).toBe(false)
    expect(cacheable('/api/cron/finalise')).toBe(false)
  })

  it('is not fooled by a path that merely contains an allowed one', () => {
    expect(cacheable('/admin/archive')).toBe(false)
    expect(cacheable('/archived')).toBe(false)
  })
})

describe('the worker keeps its own promises', () => {
  it('stores nothing but a successful GET', () => {
    expect(sw).toMatch(/request\.method !== 'GET'/)
    expect(sw).toMatch(/response\.status === 200/)
  })

  it('forgets everything personal when somebody signs out', () => {
    // A cache belongs to the browser, not the account, and students share
    // laptops. app/login/actions.ts sends this by way of the landing page.
    expect(sw).toMatch(/type === 'wipe'/)
    expect(sw).toMatch(/caches\.delete\(RUNTIME\)/)
  })

  it('leaves another origin entirely alone', () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/)
  })
})
