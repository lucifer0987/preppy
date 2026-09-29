import Link from 'next/link'
import { Wordmark } from '../../components/Wordmark'

/**
 * What the service worker shows when the network is gone and it has nothing
 * cached for where you were going.
 *
 * It is a static page on purpose: it has to render with no server, no session
 * and no data, which rules out saying anything about you. What it can do is
 * say which part of the product still works without a connection, because
 * "you are offline" on its own leaves the reader to guess.
 */
export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main data-room="home" className="flex min-h-dvh flex-col bg-page text-ink">
      <div className="shell py-5">
        <Wordmark />
      </div>
      <div className="shell flex flex-1 items-center pb-16">
        <div>
          <p className="eyebrow">No connection</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
            This page needs the network
          </h1>
          <p className="measure mt-4 text-lg text-ink-soft">
            Past papers you have already opened are readable without one. Everything else
            &mdash; today&rsquo;s paper, the leaderboard, your account &mdash; needs a connection,
            because the answer would be out of date by the time you saw it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/archive" className="btn btn-primary px-6 py-3">All papers</Link>
            <Link href="/dashboard" className="btn btn-quiet px-6 py-3">Try again</Link>
          </div>
          <p className="mt-8 measure text-sm text-ink-faint">
            A paper you are sitting is never kept offline. Its clock belongs to the server, and a
            timer read from a cache would be the wrong timer.
          </p>
        </div>
      </div>
    </main>
  )
}
