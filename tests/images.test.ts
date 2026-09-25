import { describe, expect, it } from 'vitest'
import { imageType, imageUrl } from '../lib/images'

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
