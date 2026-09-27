/*
 * Preppy's service worker: the archive, readable offline (PRD 6.12).
 *
 * The scope is deliberately small. This caches one thing -- past papers a
 * reader has already unlocked -- plus the static assets needed to render them.
 * Everything else goes to the network and stays there.
 *
 * WHY THE ARCHIVE IS SAFE TO CACHE AND NOTHING ELSE IS
 *
 * The archive only ever renders a paper the reader has finished or one that
 * has closed, and for those the answer key is already in the HTML the server
 * sent. Keeping a copy leaks nothing they cannot already read. A paper that
 * has not opened is never rendered to them in the first place, so it can never
 * enter this cache: only a 200 is stored, and a locked paper does not return
 * one.
 *
 * The exam room is never cached, at any stage. A test served from a cache
 * would carry a stale clock, and the clock is the one thing in this product
 * that must come from the server every time.
 *
 * SHARED BROWSERS
 *
 * A cache belongs to the browser, not to the account. Two students on one
 * laptop would otherwise find the first one's archive still here after the
 * second signs in, so signing out wipes it -- see the 'wipe' message below,
 * which components/ServiceWorker.tsx sends.
 */

// Bump this whenever the offline page or the rules below change. The shell
// cache holds /offline's HTML, which references build-hashed CSS; leave a
// stale copy in place across a redeploy and it renders unstyled, because the
// stylesheet it points at no longer exists.
const VERSION = 'v2'
const SHELL = `preppy-shell-${VERSION}`
const RUNTIME = `preppy-runtime-${VERSION}`
const OFFLINE = '/offline'

/** Paths whose pages may be kept. Nothing else is stored, ever. */
const CACHEABLE_PAGE = /^\/archive(\/|$)/
/** Images belonging to a paper. The route refuses a paper that has not opened,
 *  so a 200 here is by construction one this reader was allowed. */
const CACHEABLE_ASSET = /^\/api\/images\//
/** Content-hashed, so a hit is always the right file. This is the rule that
 *  makes the worker production-only: a dev server reuses one filename and
 *  changes what is behind it, so cache-first here would pin the first
 *  stylesheet it ever sent. components/ServiceWorker.tsx is where that is
 *  enforced. */
const IMMUTABLE = /^\/_next\/static\//

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  // Sent on sign-out. Everything personal lives in the runtime cache; the
  // shell holds only the offline page, which says nothing about anybody.
  if (event.data && event.data.type === 'wipe') {
    event.waitUntil(caches.delete(RUNTIME))
  }
})

/** A response worth keeping: a real one, from us, that actually succeeded. */
function storable(response) {
  return response
    && response.status === 200
    && (response.type === 'basic' || response.type === 'default')
}

async function networkFirst(request, url) {
  const cache = await caches.open(RUNTIME)
  try {
    const fresh = await fetch(request)
    if (storable(fresh)) cache.put(request, fresh.clone())
    return fresh
  } catch (networkError) {
    const hit = await cache.match(request)
    if (hit) return hit
    if (request.mode === 'navigate') {
      const fallback = await caches.match(OFFLINE)
      if (fallback) return fallback
    }
    throw networkError
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const fresh = await fetch(request)
  if (storable(fresh)) cache.put(request, fresh.clone())
  return fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  // A cache is a store of answers to GETs. Anything that changes something on
  // the server goes straight through, always.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL))
    return
  }

  if (CACHEABLE_ASSET.test(url.pathname)) {
    event.respondWith(networkFirst(request, url))
    return
  }

  // Next serves a page and its RSC payload from the same path, distinguished
  // by a header, so both are covered by the same rule. `caches.put` keys on
  // the whole request including headers via `ignoreVary: false`, which is the
  // default and what keeps the two from overwriting each other.
  if (CACHEABLE_PAGE.test(url.pathname)) {
    event.respondWith(networkFirst(request, url))
    return
  }

  // Everything else: the network, and the offline page if there is none.
  // Nothing is stored on the way past.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match(OFFLINE)
        return fallback ?? Response.error()
      }),
    )
  }
})
