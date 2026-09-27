import { NextResponse } from 'next/server'
import { signIn } from '../../lib/auth'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const u = url.searchParams.get('u')
  if (u) {
    const r = await signIn(u, url.searchParams.get('p') ?? '')
    if (!r.ok) return NextResponse.json(r, { status: 401 })
  }
  const to = url.searchParams.get('to') ?? '/'
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><script>
      try { localStorage.setItem('preppy-theme', ${JSON.stringify(theme)}) } catch {}
      location.replace(${JSON.stringify(to)})
    </script>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}
