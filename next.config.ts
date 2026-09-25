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

const config: NextConfig = {
  productionBrowserSourceMaps: isLocalBuild,
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
