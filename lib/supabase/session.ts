import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '../env'

/**
 * A request-scoped client used only for authentication: sign in, sign out and
 * reading who is logged in. It holds the publishable key, which reads no
 * application data on its own because every table denies by default. Data goes
 * through the secret-key client instead (see admin.ts).
 *
 * "Middleware" below is proxy.ts: Next.js 16 renamed it, and it is what refreshes
 * the session cookie a Server Component cannot write.
 */
export async function authClient() {
  const store = await cookies()
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
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
