import type { MetadataRoute } from 'next'

/**
 * Nothing here is for a search engine.
 *
 * Preppy is a closed cohort: accounts are made by an admin and there is no
 * sign-up, so every page behind the login is unreachable to a crawler anyway.
 * What is reachable is the splash page and the login form, and neither is
 * worth indexing -- the only thing indexing them achieves is putting a
 * private study group's login page in a search result.
 *
 * The header in app/layout.tsx says the same thing a second way, for crawlers
 * that read the page rather than this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
