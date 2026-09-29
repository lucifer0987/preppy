import { describe, expect, it } from 'vitest'
import { fullscreenState, fullscreenSupported, type FullscreenDoc } from '../lib/fullscreen'

/**
 * The rule that decides whether a phone can sit a paper at all.
 *
 * A browser with no full-screen mode is not a browser refusing full screen,
 * and the whole of this file is that distinction. Read as a refusal, Begin
 * never submitted and no attempt row was written -- so on an iPhone a student
 * could press Begin all evening and end the night with nothing recorded, which
 * is how one of them did.
 */
const desktop = (inIt: boolean): FullscreenDoc => ({
  documentElement: { requestFullscreen: () => Promise.resolve() },
  fullscreenElement: inIt ? {} : null,
})
/** iPhone Safari: only a video can go full screen, so the method is absent. */
const iphone: FullscreenDoc = { documentElement: {}, fullscreenElement: undefined }

describe('whether full screen applies', () => {
  it('is supported where the method exists', () => {
    expect(fullscreenSupported(desktop(false))).toBe(true)
  })

  it('is not supported where it is missing', () => {
    expect(fullscreenSupported(iphone)).toBe(false)
  })

  /** A property that is there but not callable is not an implementation. */
  it('does not count a non-function as support', () => {
    expect(fullscreenSupported({ documentElement: { requestFullscreen: true } })).toBe(false)
    expect(fullscreenSupported({ documentElement: { requestFullscreen: undefined } })).toBe(false)
  })
})

describe('the three states', () => {
  it('reads true inside full screen and false outside it', () => {
    expect(fullscreenState(desktop(true))).toBe(true)
    expect(fullscreenState(desktop(false))).toBe(false)
  })

  /**
   * The one that matters. false raises the engine's "Return to full screen"
   * wall and blocks every key behind it; on a browser that has no full screen
   * that wall could never be dismissed, over a button that could do nothing.
   */
  it('reads null -- not false -- where there is no full screen to be outside of', () => {
    expect(fullscreenState(iphone)).toBeNull()
    expect(fullscreenState(iphone)).not.toBe(false)
  })

  it('never reports null for a browser that has it', () => {
    expect(fullscreenState(desktop(true))).not.toBeNull()
    expect(fullscreenState(desktop(false))).not.toBeNull()
  })
})
