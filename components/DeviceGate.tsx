'use client'

import { useEffect, useState } from 'react'

/**
 * FR-6.5.8: a paper is taken on a laptop, not a phone.
 *
 * Checked on the client because it depends on the viewport, and re-checked on
 * resize so rotating a small tablet mid-test does not leave a broken layout.
 *
 * The block is an overlay, not a replacement: the engine underneath stays
 * mounted, so narrowing the window for a moment and widening it again comes
 * back to the same question with the same unsaved answers, not to a rebuild
 * from the snapshot the page loaded with.
 */
const MIN_WIDTH = 1024

export function DeviceGate({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = useState<boolean | null>(null)

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= MIN_WIDTH)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // inert takes the engine out of reach behind the block: no clicks, no
  // focus, and the engine's own key handler checks for it too.
  return (
    <>
      <div inert={wide === false}>{children}</div>
      {wide === false && (
        <main className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-play-purple px-8 text-center text-white">
          <p className="text-3xl font-black">Open this on a laptop</p>
          <p className="max-w-sm text-white/75">
            A paper needs a screen at least {MIN_WIDTH} pixels wide, for the question palette and the
            timer. The real exam is desktop-only too.
          </p>
          <p className="max-w-sm text-sm text-white/50">
            Your dashboard, past papers and the leaderboard all work fine on a phone.
          </p>
        </main>
      )}
    </>
  )
}
