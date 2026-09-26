import { describe, expect, it, vi } from 'vitest'
import { imageType, imageUrl } from '../lib/images'

vi.mock('server-only', () => ({}))
vi.mock('../lib/supabase/admin', () => ({ db: () => { throw new Error('not used') } }))
const { PAPER_ID_PATTERN } = await import('../lib/repo/images')

describe('paper images', () => {
  it('maps extensions to their MIME type, case-insensitively', () => {
    expect(imageType('a.PNG')).toBe('image/png')
    expect(imageType('a.jpeg')).toBe('image/jpeg')
    expect(imageType('a.svg')).toBeNull()
  })

  it('builds a URL that keeps both segments intact', () => {
    expect(imageUrl('abc', 'di-1.png')).toBe('/api/images/abc/di-1.png')
  })
})

describe('a paper id on its way to becoming a storage path', () => {
  it('accepts a uuid in either case', () => {
    expect(PAPER_ID_PATTERN.test('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
    expect(PAPER_ID_PATTERN.test('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true)
  })

  it('refuses anything that could climb out of the folder', () => {
    // These reach the storage layer by string interpolation, and the image
    // route's admin branch never does the database lookup that would otherwise
    // have rejected them.
    for (const bad of [
      '..', '../..', 'a/../b', '3f2504e0-4f89-41d3-9a0c-0305e82c3301/..',
      '%2e%2e', '', ' ', 'not-a-uuid', '3f2504e04f8941d39a0c0305e82c3301',
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301\n', 'x3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    ]) {
      expect(PAPER_ID_PATTERN.test(bad), bad).toBe(false)
    }
  })
})
