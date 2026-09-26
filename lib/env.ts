/**
 * Environment variables, read in one place so a missing one fails with an
 * instruction rather than "undefined is not a function" three layers down.
 *
 * Supabase is part-way through replacing its API keys. The old pair -- `anon`
 * and `service_role`, both long JWTs starting `eyJ` -- is being retired in
 * favour of `sb_publishable_...` and `sb_secret_...`. Both work today, and a
 * secret key resolves to the same `service_role` Postgres role the old one did,
 * so either name is accepted for either slot: the current one wins when it has a
 * value, and an .env.local written before the change keeps working untouched.
 *
 * Both names are written out literally rather than looked up through a variable.
 * Next.js substitutes NEXT_PUBLIC_* at build time by finding those exact
 * expressions in the source, so `process.env[name]` would compile to undefined
 * in the browser.
 */

/**
 * The first of these that actually has a value.
 *
 * Deliberately not `??`, which only skips null and undefined. `.env.example`
 * ships the alternative names as blank lines, and a blank is a set variable as
 * far as `??` is concerned -- so `SUPABASE_SECRET_KEY=` with nothing after it
 * would shadow a perfectly good legacy key and the app would insist the key was
 * missing. A blank means "not provided", here and in isConfigured below.
 */
export function firstSet(...values: (string | undefined)[]): string | undefined {
  for (const v of values) if (v && v.trim() !== '') return v
  return undefined
}

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

const KEYS_PAGE = 'Settings -> API Keys'

/** Safe to send to the browser. */
export const publicEnv = {
  get supabaseUrl() {
    return must('NEXT_PUBLIC_SUPABASE_URL', firstSet(process.env.NEXT_PUBLIC_SUPABASE_URL),
      `the "Connect" button at the top of the dashboard, or ${KEYS_PAGE}`)
  },
  /**
   * The browser-side key. Low privilege whichever generation it is: row-level
   * security denies everything by default, so this key on its own reads nothing.
   */
  get supabasePublishableKey() {
    return must(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)',
      firstSet(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      `${KEYS_PAGE} -> the publishable key (sb_publishable_...), or the legacy anon key`)
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
      firstSet(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY),
      `${KEYS_PAGE} -> a secret key (sb_secret_...), or the legacy service_role key. Keep it secret`)
  },
}

/**
 * True when the app has enough configuration to talk to Supabase.
 *
 * Uses the same emptiness rule as the getters above. If these two ever disagree,
 * a page passes this check and then throws from a getter, which reads as a crash
 * rather than as missing setup.
 */
export function isConfigured(): boolean {
  return Boolean(
    firstSet(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && firstSet(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
    && firstSet(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY),
  )
}
