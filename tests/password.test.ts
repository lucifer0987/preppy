import { describe, expect, it } from 'vitest'
import { PASSWORD_ALPHABET, PASSWORD_BITS, generatePassword, sessionIdFromToken } from '../lib/password'

describe('generated passwords', () => {
  it('are three groups of four from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).toMatch(/^[0-9a-hjkmnp-tv-z]{4}-[0-9a-hjkmnp-tv-z]{4}-[0-9a-hjkmnp-tv-z]{4}$/)
    }
  })

  it('never use the letters that read as digits', () => {
    expect(PASSWORD_ALPHABET).not.toMatch(/[ilou]/)
    expect(new Set(PASSWORD_ALPHABET).size).toBe(32)
  })

  it('carry at least 50 bits', () => {
    expect(PASSWORD_BITS).toBeGreaterThanOrEqual(50)
  })

  it('do not repeat', () => {
    const seen = new Set(Array.from({ length: 2000 }, generatePassword))
    expect(seen.size).toBe(2000)
  })

  it('use the whole alphabet', () => {
    const chars = new Set(Array.from({ length: 500 }, generatePassword).join('').replace(/-/g, ''))
    expect(chars.size).toBe(32)
  })
})

describe('the session a token belongs to', () => {
  const token = (claims: object) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`

  it('reads the session_id claim', () => {
    expect(sessionIdFromToken(token({ sub: 'u', session_id: 's-1' }))).toBe('s-1')
  })

  it('returns null for a token without one, or no token at all', () => {
    expect(sessionIdFromToken(token({ sub: 'u' }))).toBeNull()
    expect(sessionIdFromToken('not-a-jwt')).toBeNull()
    expect(sessionIdFromToken(null)).toBeNull()
  })
})
