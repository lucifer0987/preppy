/**
 * Environment variables, read in one place so a missing one fails with an
 * instruction rather than "undefined is not a function" three layers down.
 */

function required(name: string, value: string | undefined, where: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
      `Add it to .env.local. You can find it in your Supabase project under\n` +
      `${where}.\n\n` +
      `See SETUP.md for the full walkthrough.`,
    )
  }
  return value
}

/** Safe to send to the browser. */
export const publicEnv = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL,
      'Settings -> API -> Project URL')
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Settings -> API -> Project API keys -> anon public')
  },
}

/** Server only. Never import this from a client component. */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Settings -> API -> Project API keys -> service_role (keep this secret)')
  },
}

/** True when the app has enough configuration to talk to Supabase. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}
