/**
 * Environment variables, read in one place so a missing one fails with an
 * instruction rather than "undefined is not a function" three layers down.
 *
 * Supabase is part-way through replacing its API keys. The old pair -- `anon`
 * and `service_role`, both long JWTs starting `eyJ` -- is being retired in
 * favour of `sb_publishable_...` and `sb_secret_...`. Both work today, so both
 * names are accepted here: the new one wins if it is set, and the old one keeps
 * an existing .env.local working untouched.
 *
 * The two names are written out literally rather than looked up through a
 * variable, because Next.js substitutes NEXT_PUBLIC_* at build time by finding
 * those exact expressions in the source. `process.env[name]` would compile to
 * undefined in the browser.
 */

function must(names: string, value: string | undefined, where: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${names}.\n\n` +
      `Add it to .env.local. You can find it in your Supabase project under\n` +
      `${where}.\n\n` +
      `See docs/setup.html, or docs/architecture.html for the full walkthrough.`,
    )
  }
  return value
}

const API_KEYS_PAGE = 'Settings -> API Keys'

/** Safe to send to the browser. */
export const publicEnv = {
  get supabaseUrl() {
    return must('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL,
      `${API_KEYS_PAGE} (the project URL is also on the Connect dialog)`)
  },
  /**
   * The browser-side key. Low privilege either way: row-level security denies
   * everything by default, so this key on its own reads nothing.
   */
  get supabasePublishableKey() {
    return must(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      `${API_KEYS_PAGE} -> the publishable key (sb_publishable_...), or the legacy anon key`)
  },
}

/** Server only. Never import this from a client component. */
export const serverEnv = {
  /**
   * The key that bypasses every access rule. A secret key resolves to the same
   * service_role Postgres role the legacy key did, so this is a drop-in.
   */
  get supabaseSecretKey() {
    return must(
      'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)',
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
      `${API_KEYS_PAGE} -> a secret key (sb_secret_...), or the legacy service_role key. Keep it secret`)
  },
}

/** True when the app has enough configuration to talk to Supabase. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  )
}
