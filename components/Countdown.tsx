'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Counts down to a server-chosen instant: the next unlock, the entry cut-off,
 * the end of a running section.
 *
 * The target instant is computed on the server and passed in, so a wrong clock
 * on the viewer's machine shifts only this display and never anything that
 * decides a score (FR-6.4.7 keeps the real timer server-authoritative).
 *
 * `nowIso` is the server's clock at render. The first render counts from it,
 * so server and client produce identical markup and hydrate cleanly; after
 * that the client ticks on its own clock, corrected by the skew measured at
 * mount, so a fast or slow laptop still reaches zero when the server does.
 *
 * At zero the page is refreshed once, so the dashboard flips to the entry card
 * when the window opens (or to "Entry closed" when entry shuts) without
 * anyone reloading. The
 * refresh waits a second past zero so the server is sure to agree the moment
 * has come; if it still does not, it renders a fresh target and this counts
 * down again rather than sitting at 00:00:00.
 */
export function Countdown({
  targetIso, nowIso, label = 'Next paper unlocks in', tone = 'on-dark',
}: {
  targetIso: string
  nowIso?: string
  label?: string
  /**
   * Which ground the cells sit on. The dashboard hero is a dark panel in both
   * themes, so a white wash is right there; the landing card follows the theme,
   * where a white wash would vanish in light mode.
   */
  tone?: 'on-dark' | 'on-surface'
}) {
  const router = useRouter()
  const target = new Date(targetIso).getTime()
  const serverNow = nowIso ? new Date(nowIso).getTime() : null
  const [remaining, setRemaining] = useState(() => target - (serverNow ?? Date.now()))

  useEffect(() => {
    // Server minus client. The delay between render and mount makes this run
    // a moment late, never early, which is the safe side for the refresh.
    const skew = serverNow === null ? 0 : serverNow - Date.now()
    // Only a countdown seen crossing zero refreshes, so a target that is
    // already past on arrival cannot set off a refresh loop.
    let armed = false
    let refreshed = false
    const tick = () => {
      const left = target - (Date.now() + skew)
      setRemaining(left)
      if (left > 0) armed = true
      if (armed && left <= -1000 && !refreshed) {
        refreshed = true
        router.refresh()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target, serverNow, router])

  const clamped = Math.max(0, remaining)
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)

  return (
    <div
      className="flex gap-2"
      role="timer"
      // A timer that announced every second would make the page unusable with
      // a screen reader, so the label carries the information once instead.
      aria-live="off"
      aria-label={`${label} ${hours} hours ${minutes} minutes`}
      // Only reached when a caller omits nowIso: the server's Date.now() and
      // the browser's then differ, and the first tick corrects it.
      suppressHydrationWarning
    >
      <Cell value={hours} label="hrs" tone={tone} />
      <Cell value={minutes} label="min" tone={tone} />
      <Cell value={seconds} label="sec" tone={tone} />
    </div>
  )
}

function Cell({ value, label, tone }: {
  value: number; label: string; tone: 'on-dark' | 'on-surface'
}) {
  return (
    <div className={[
      'flex min-w-[4.25rem] flex-col items-center rounded-control px-3.5 py-2.5',
      tone === 'on-dark' ? 'bg-white/15' : 'border border-line bg-surface-sunken',
    ].join(' ')}>
      <span className="numeral text-3xl font-black leading-none" suppressHydrationWarning>
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
    </div>
  )
}
