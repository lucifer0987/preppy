import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '../env'

/**
 * The only client that reads or writes application data.
 *
 * FR-10.4: the browser never queries Supabase. Everything goes through server
 * code holding the secret key -- `sb_secret_...`, or the legacy `service_role`
 * key it replaces; both resolve to the `service_role` Postgres role, which has
 * BYPASSRLS. Combined with deny-all policies on every table, the publishable key
 * the browser does hold reads nothing.
 *
 * The `server-only` import above turns any accidental client-side import into
 * a build error rather than a leaked key.
 */
let cached: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (cached) return cached
  cached = createClient(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
