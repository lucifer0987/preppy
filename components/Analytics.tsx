'use client'

import { Analytics as VercelAnalytics } from '@vercel/analytics/next'

/**
 * Vercel Web Analytics, with the ids taken out of the URL first.
 *
 * WHY THIS WRAPPER EXISTS
 *
 * Web Analytics stores the URL of every page view, and Preppy's URLs carry
 * uuids: /test/<attemptId>, /archive/<testId>, /admin/papers/<testId>. It also
 * stores a city-level location, and identifies a visitor by a hash of the
 * request for 24 hours.
 *
 * None of those is a problem for a site with thousands of visitors. This site
 * has six people, and at six people "Mumbai, Chrome on Android, this attempt
 * id, 10:14pm" is not anonymous in any way that matters -- not to Vercel, who
 * cannot resolve the id, but to anyone with a dashboard login and the
 * database. Aggregate analytics should not quietly become a per-student
 * activity log.
 *
 * So `beforeSend` rewrites the URL before it leaves the browser. Vercel
 * documents this as the way to keep identifiers out of page views, and the
 * substitution keeps every bit of the shape that is actually useful: which
 * screens get used, on what, from where.
 *
 *   /archive/37a7d6b7-7c06-4c6a-ac23-2e77966e00ef   ->  /archive/[id]
 *   /test/6225f300-255a-4b44-81ab-d825e830249d/done ->  /test/[id]/done
 *
 * A client component because `beforeSend` is a function, and a function
 * cannot be handed from a Server Component to a client one.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Exported for the test: the rule is worth checking, not just the wiring. */
export function withoutIds(url: string): string {
  return url.replace(UUID, '[id]')
}

export function Analytics() {
  return <VercelAnalytics beforeSend={(event) => ({ ...event, url: withoutIds(event.url) })} />
}
