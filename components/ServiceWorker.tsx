'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker, and wipes what it kept when somebody signs out.
 *
 * The worker itself is public/sw.js, and the reasoning about what may be
 * cached lives there. This is only the two things that have to happen in the
 * page: registering it, and telling it to forget.
 *
 * `wipe` is the important half. A cache belongs to the browser rather than to
 * the account, so without it two students sharing a laptop would find the
 * first one's past papers still readable after the second signs in.
 */
export function ServiceWorker({ signedOut = false }: {
  /** True on the login page, just after a sign-out. */
  signedOut?: boolean
}) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Registered after load so it never competes with the first paint, which
    // on a paper night is the thing that matters.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((e: Error) => {
        // A browser that refuses is a browser without offline reading, not a
        // broken app. Nothing else depends on this.
        console.warn('[sw] not registered:', e.message)
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  useEffect(() => {
    if (!signedOut || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'wipe' }))
      .catch(() => {})
  }, [signedOut])

  return null
}
