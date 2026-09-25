import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '../env'

/**
 * The only client that reads or writes application data.
 *
 * FR-10.4: the browser never queries Supabase. Everything goes through server
 * code holding the service-role key, which bypasses RLS. Combined with
 * deny-all policies on every table, a leaked anon key reads nothing.
 *
 * The `server-only` import above turns any accidental client-side import into
 * a build error rather than a leaked key.
 */
let cached: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (cached) return cached
  cached = createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
