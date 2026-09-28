import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { firstSet, isConfigured, publicEnv, serverEnv } from '../lib/env'

/**
 * Which environment variable wins, and what counts as set.
 *
 * Supabase is replacing `anon` and `service_role` with publishable and secret
 * keys, so every slot accepts two names. The subtlety that bit once: `.env.example`
 * ships the alternative names as blank lines, and a blank is a *set* variable as
 * far as `??` is concerned -- so a blank current name would shadow a perfectly
 * good legacy key and the app would insist the key was missing.
 *
 * Worse, the check and the getters disagreed about it: isConfigured used `||`,
 * which does skip a blank, while the getters used `??`, which does not. A page
 * would pass the configured check and then throw from a getter, which reads as a
 * crash rather than as missing setup.
 */

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const URL = 'https://example.supabase.co'
const PUBLISHABLE = 'sb_publishable_0123456789abcdefghijklmn'
const SECRET = 'sb_secret_0123456789abcdefghijklmnopqrst'
const LEGACY_ANON = 'eyJhbGciOiJIUzI1NiJ9.legacy-anon-key-value'
const LEGACY_SERVICE = 'eyJhbGciOiJIUzI1NiJ9.legacy-service-role-value'

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('what counts as a value', () => {
  it('skips undefined, empty and whitespace-only', () => {
    expect(firstSet(undefined, '', '   ', 'real')).toBe('real')
    expect(firstSet(undefined, '')).toBeUndefined()
    expect(firstSet('   ')).toBeUndefined()
  })

  it('takes the first one that has something in it', () => {
    expect(firstSet('first', 'second')).toBe('first')
    expect(firstSet('', 'second')).toBe('second')
  })
})

describe('either generation of key', () => {
  it('reads the current names', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE
    process.env.SUPABASE_SECRET_KEY = SECRET

    expect(isConfigured()).toBe(true)
    expect(publicEnv.supabasePublishableKey).toBe(PUBLISHABLE)
    expect(serverEnv.supabaseSecretKey).toBe(SECRET)
  })

  it('reads the legacy names', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON
    process.env.SUPABASE_SERVICE_ROLE_KEY = LEGACY_SERVICE

    expect(isConfigured()).toBe(true)
    expect(publicEnv.supabasePublishableKey).toBe(LEGACY_ANON)
    expect(serverEnv.supabaseSecretKey).toBe(LEGACY_SERVICE)
  })

  it('prefers the current name when both are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON
    process.env.SUPABASE_SECRET_KEY = SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = LEGACY_SERVICE

    expect(publicEnv.supabasePublishableKey).toBe(PUBLISHABLE)
    expect(serverEnv.supabaseSecretKey).toBe(SECRET)
  })

  it('is not shadowed by a blank current name', () => {
    // Exactly what .env.example produces when somebody uncomments the legacy
    // line and leaves the new one in place: one blank, one filled.
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON
    process.env.SUPABASE_SECRET_KEY = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = LEGACY_SERVICE

    expect(isConfigured()).toBe(true)
    expect(publicEnv.supabasePublishableKey).toBe(LEGACY_ANON)
    expect(serverEnv.supabaseSecretKey).toBe(LEGACY_SERVICE)
  })
})

describe('when it is not configured', () => {
  it('says so rather than half-working', () => {
    expect(isConfigured()).toBe(false)
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL
    expect(isConfigured()).toBe(false)
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE
    expect(isConfigured()).toBe(false)
    process.env.SUPABASE_SECRET_KEY = SECRET
    expect(isConfigured()).toBe(true)
  })

  it('treats a file of blank lines as not configured', () => {
    // The state a fresh `cp .env.example .env.local` leaves behind.
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''
    process.env.SUPABASE_SECRET_KEY = ''
    expect(isConfigured()).toBe(false)
  })

  it('names both accepted spellings when it throws', () => {
    // The message is the only guidance somebody gets at that moment, so it has
    // to name the variable they may actually have filled in.
    expect(() => publicEnv.supabasePublishableKey)
      .toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \(or NEXT_PUBLIC_SUPABASE_ANON_KEY\)/)
    expect(() => serverEnv.supabaseSecretKey)
      .toThrow(/SUPABASE_SECRET_KEY \(or SUPABASE_SERVICE_ROLE_KEY\)/)
  })

  it('points at the page the keys are actually on', () => {
    // Supabase moved them: Settings -> API, which every document used to name,
    // no longer exists.
    expect(() => serverEnv.supabaseSecretKey).toThrow(/Settings -> API Keys/)
    expect(() => publicEnv.supabaseUrl).toThrow(/Connect/)
  })
})

describe('every place a Supabase key is read', () => {
  const sources: [string, string][] = [
    ['proxy.ts', readFileSync('proxy.ts', 'utf8')],
    ['lib/env.ts', readFileSync('lib/env.ts', 'utf8')],
  ]

  /**
   * Supabase renamed the browser key from anon to publishable, and .env.example
   * ships the new name. proxy.ts read the legacy name alone, so on a project
   * set up from the documented steps it got undefined, returned early, and
   * never refreshed the session -- silently, because an unrefreshed session
   * looks exactly like a session until it expires.
   *
   * So: anywhere that reads one name must read the other too.
   */
  it('accepts both generations of the name, everywhere', () => {
    for (const [name, src] of sources) {
      const readsNew = src.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
      const readsOld = src.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')
      expect(readsNew, `${name} reads the legacy name only`).toBe(readsOld)
    }
  })

  it('reads them through firstSet rather than ??', () => {
    // `??` treats an empty string as set, and .env.example ships the unused
    // alternative as a blank line, so `??` would pick the blank.
    const proxy = sources[0]![1]
    expect(proxy).toMatch(/firstSet\(/)
    expect(proxy).not.toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*\?\?/)
  })
})
