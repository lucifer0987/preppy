import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '../env'

/**
 * A request-scoped client used only for authentication: sign in, sign out and
 * reading who is logged in. Application data never goes through it — that is
 * the service-role client's job (see admin.ts).
 */
export async function authClient() {
  const store = await cookies()
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  })
}
