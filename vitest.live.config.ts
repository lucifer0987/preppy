import { defineConfig } from 'vitest/config'

/** The opt-in half: see the note in vitest.config.ts. */
export default defineConfig({
  test: { include: ['tests/live/**/*.test.ts'], testTimeout: 30_000 },
})
