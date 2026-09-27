import Link from 'next/link'
import { Wordmark } from '../components/Wordmark'

/**
 * Next's own 404 is unstyled black-on-black, which in an app with two themes
 * looks like the site broke rather than like a wrong address.
 *
 * It cannot know whether the visitor is logged in, so it does not guess:
 * both doors are offered and neither is presented as the likely one.
 */
export default function NotFound() {
  return (
    <main data-room="home" className="flex min-h-dvh flex-col bg-page text-ink">
      <div className="shell py-5">
        <Wordmark />
      </div>
      <div className="shell flex flex-1 items-center pb-16">
        <div>
          <p className="numeral text-sm font-bold tracking-widest text-ink-faint">404</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
            There is nothing at this address
          </h1>
          <p className="measure mt-4 text-lg text-ink-soft">
            The link may be old, or a paper that used to be here has been removed.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-primary px-6 py-3">Today&rsquo;s paper</Link>
            <Link href="/login" className="btn btn-quiet px-6 py-3">Log in</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
