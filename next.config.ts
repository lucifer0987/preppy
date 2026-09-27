import type { NextConfig } from 'next'

/**
 * Two builds, one config.
 *
 *   APP_ENV=local       a production server you run on your own machine to
 *                       debug. Source maps are kept, so a stack trace in the
 *                       browser points at real code.
 *   APP_ENV=production  what the live site runs. Source maps are dropped, so
 *                       the browser is never handed readable source.
 *
 * Everything else is identical on purpose: a local build that behaved
 * differently from production would not be worth debugging against.
 */
const isLocalBuild = process.env.APP_ENV === 'local'

/**
 * Headers every response carries.
 *
 * The one that matters most here is frame-ancestors. A test that can be put in
 * an iframe is a test somebody can be tricked into ending, and the engine
 * requires full screen -- which a framed page cannot honestly give. Sent twice,
 * as CSP for current browsers and X-Frame-Options for older ones.
 *
 * There is no script-src. Doing it properly needs a nonce threaded through
 * Next's own inline hydration scripts and the theme script in app/layout.tsx,
 * and a half-done script-src is worse than none: it breaks the theme stamp and
 * gives a false sense of cover. It is written down as the next thing rather
 * than guessed at here.
 */
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  // The app serves paper images from its own route; none of them should ever
  // be sniffed into something executable.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here wants a camera, a microphone or a location. Full screen is
  // the one capability the exam room actually uses.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
  },
  // Vercel sets this too; saying it here means a different host still gets it.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const config: NextConfig = {
  productionBrowserSourceMaps: isLocalBuild,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  experimental: {
    // Next caps Server Action bodies at 1 MB by default. A paper carrying
    // diagrams for a DI set or a puzzle easily passes that, and the framework
    // rejects it with an error the admin cannot act on.
    //
    // Set deliberately above the upload action's own 10 MB ceiling: multipart
    // boundaries and part headers add overhead to the raw body, so an equal
    // limit would let the framework reject a file the action would have
    // explained. The action's message should always be the one that wins.
    serverActions: { bodySizeLimit: '11mb' },
  },
}

export default config
