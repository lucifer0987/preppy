import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The headers every response carries, and the fact that nothing here is for a
 * search engine.
 *
 * Read out of next.config.ts rather than restated, for the reason
 * tests/offline.test.ts reads public/sw.js: a test holding its own copy of a
 * security property passes while the real file drifts.
 */
const config = readFileSync('next.config.ts', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')
const robots = readFileSync('app/robots.ts', 'utf8')

describe('a test cannot be put in a frame', () => {
  // A framed test is a test somebody can be tricked into ending, and the
  // engine requires full screen, which a framed page cannot honestly give.
  it('refuses every frame ancestor', () => {
    expect(config).toMatch(/frame-ancestors 'none'/)
  })

  it('says it the old way too, for browsers that do not read CSP', () => {
    expect(config).toMatch(/X-Frame-Options.*DENY/)
  })
})

describe('the other headers', () => {
  it('stops a paper image being sniffed into something executable', () => {
    expect(config).toMatch(/X-Content-Type-Options.*nosniff/)
  })

  it('does not leak the path somebody came from to another origin', () => {
    expect(config).toMatch(/Referrer-Policy.*strict-origin-when-cross-origin/)
  })

  it('gives away no camera, microphone or location, and keeps full screen', () => {
    const line = config.match(/Permissions-Policy[^\n]*\n[^\n]*/)?.[0] ?? config
    for (const denied of ['camera=()', 'microphone=()', 'geolocation=()']) {
      expect(line).toContain(denied)
    }
    // The exam room needs this one, so it is the exception rather than an
    // oversight.
    expect(line).toContain('fullscreen=(self)')
  })

  it('applies them to every path, not just pages', () => {
    expect(config).toMatch(/source: '\/:path\*'/)
  })
})

describe('nothing here is for a search engine', () => {
  // Accounts are made by an admin and there is no sign-up, so the only pages a
  // crawler can reach are the splash and the login form. Indexing those puts a
  // private study group's login page in a search result and achieves nothing
  // else.
  it('disallows every crawler', () => {
    expect(robots).toMatch(/userAgent: '\*'/)
    expect(robots).toMatch(/disallow: '\/'/)
  })

  it('says it in the page as well, for crawlers that do not fetch robots.txt', () => {
    expect(layout).toMatch(/robots:\s*\{[^}]*index:\s*false/)
  })
})

describe('performance telemetry is production-only', () => {
  /**
   * @vercel/speed-insights picks its script host itself: on a Vercel
   * deployment it is same-origin, but off Vercel the library falls back to a
   * debug script on va.vercel-scripts.com. Rendered unconditionally, that
   * means a cross-origin request on every page load of every development day,
   * reporting numbers nobody will read.
   *
   * The gate is one condition in the layout, which is exactly the kind of
   * thing that gets "simplified" away later.
   */
  it('renders only in a production build', () => {
    expect(layout).toMatch(/SpeedInsights/)
    const gate = layout.indexOf("process.env.NODE_ENV === 'production' && <SpeedInsights />")
    expect(gate, 'SpeedInsights is no longer gated to production').toBeGreaterThan(-1)
  })

  it('is rendered, not hand-rolled', () => {
    // A hand-written script tag would not get the same-origin path on Vercel,
    // and would be the version nobody updates. The host may be named in a
    // comment -- it is -- but must not be a src anybody loads.
    expect(layout).toMatch(/from '@vercel\/speed-insights\/next'/)
    expect(layout).not.toMatch(/src=["'][^"']*vercel-scripts/)
  })
})
