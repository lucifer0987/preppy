import { defineConfig } from 'vitest/config'

/**
 * Two suites, and only one of them is allowed to touch the network.
 *
 * `tests/` is hermetic: pure logic, plus the schema exercised against an
 * in-process Postgres. It is what `npm test` and the production build gate on,
 * so it must pass on a laptop with no credentials and no internet.
 *
 * `tests/live/` talks to the real Supabase project named in .env.local. It is
 * read-only and opt-in (`npm run test:live`), and it exists because the one
 * layer nothing else covers is the one that turns a query into a URL: a select
 * that forgets a column is invisible to TypeScript and to pglite, and has
 * already shipped twice.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/live/**', 'node_modules/**'],
  },
})
