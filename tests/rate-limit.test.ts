import { describe, expect, it } from 'vitest'
import { LIMITS, clientIp, retryMessage } from '../lib/rate-limit'

// The counting itself runs in SQL and is tested in tests/schema.test.ts.

describe('rate limit helpers', () => {
  it('says how long to wait, rounding up to whole minutes', () => {
    expect(retryMessage(1)).toBe('Too many failed attempts. Try again in 1 minute.')
    expect(retryMessage(14 * 60 + 1)).toBe('Too many failed attempts. Try again in 15 minutes.')
  })

  it('takes the first forwarded address', () => {
    expect(clientIp('203.0.113.7, 10.0.0.1', null)).toBe('203.0.113.7')
    expect(clientIp(null, ' 198.51.100.2 ')).toBe('198.51.100.2')
    expect(clientIp(null, null)).toBe('unknown')
  })

  it('never limits a student more tightly than a fast, honest session writes', () => {
    // Every answer, flag and move is one batched write at most every 300 ms.
    expect(LIMITS.responses.max / LIMITS.responses.windowSec).toBeGreaterThan(1 / 0.3)
  })
})
