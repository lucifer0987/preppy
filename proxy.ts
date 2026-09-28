import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { firstSet } from './lib/env'

/**
 * Refreshes the Supabase session cookie on every navigation.
 *
 * Called Proxy since Next.js 16; this is what used to be Middleware.
 *
 * Server Components cannot write cookies, so without this a session would
 * expire mid-visit and silently log the user out. This only touches auth
 * cookies; it never reads application data.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Both names, in the order Supabase renamed them, exactly as lib/env.ts does
  // for every other read. This read used to take the legacy name alone, and
  // .env.example ships the new one -- so on any project set up from the
  // documented steps the key was undefined, this returned early, and the
  // session was never refreshed. Nothing failed loudly: sessions simply
  // expired mid-visit and signed people out, which is the exact thing this
  // file exists to prevent.
  //
  // Both must be written out in full. Next inlines NEXT_PUBLIC_* by matching
  // the literal property access at build time, so neither can be computed.
  const key = firstSet(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  // Before setup, there is no session to refresh.
  if (!url || !key) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
