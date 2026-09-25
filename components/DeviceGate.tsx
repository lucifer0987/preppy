'use client'

import { useEffect, useState } from 'react'

/**
 * FR-6.5.8: a paper is taken on a laptop, not a phone.
 *
 * Checked on the client because it depends on the viewport, and re-checked on
 * resize so rotating a small tablet mid-test does not leave a broken layout.
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

  if (wide === null) return null
  if (wide) return <>{children}</>

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-play-purple px-8 text-center text-white">
      <p className="text-3xl font-black">Open this on a laptop</p>
      <p className="max-w-sm text-white/75">
        A paper needs a screen at least {MIN_WIDTH} pixels wide, for the question palette and the
        timer. The real exam is desktop-only too.
      </p>
      <p className="max-w-sm text-sm text-white/50">
        Your dashboard, past papers and the leaderboard all work fine on a phone.
      </p>
    </main>
  )
}
