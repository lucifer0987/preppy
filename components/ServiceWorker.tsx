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
 *
 * It is registered in production builds only, and section 9 of the engineering
 * reference says why: the worker serves /_next/static/* cache-first, which is
 * safe exactly because those filenames are content-hashed. Development does
 * not hash them -- it reuses one name and changes what is behind it -- so the
 * same rule pins the first stylesheet a dev server ever sent and the page
 * quietly stops responding to edits. Offline reading is tested against a real
 * build (`npm run build && npm run start`), which is also the only place it
 * behaves the way a student's browser will.
 */
export function ServiceWorker({ signedOut = false }: {
  /** True on the login page, just after a sign-out. */
  signedOut?: boolean
}) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // A worker registered by an earlier production build, or by a dev server
    // from before this guard existed, outlives the decision not to register
    // one: it keeps answering fetches and keeps serving whatever it cached.
    // So development actively takes it down rather than merely declining to
    // add one, and drops the caches with it.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => ('caches' in window
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : undefined))
        .catch(() => {})
      return
    }

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
