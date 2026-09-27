'use client'

import Link from 'next/link'
import { Wordmark } from '../components/Wordmark'

/**
 * The last resort, for a render that threw where nothing else caught it.
 *
 * The one thing a student needs to know here is whether their work survived,
 * so that is the sentence the page leads with. Answers are written as they
 * are chosen, never at the end, so the honest answer is yes.
 */
export default function ErrorPage(
  { error, reset }: { error: Error & { digest?: string }; reset: () => void },
) {
  return (
    <main data-room="home" className="flex min-h-dvh flex-col bg-page text-ink">
      <div className="shell py-5">
        <Wordmark />
      </div>
      <div className="shell flex flex-1 items-center pb-16">
        <div>
          <p className="eyebrow text-bad-ink">Something broke</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
            This page would not load
          </h1>
          <p className="measure mt-4 text-lg text-ink-soft">
            Nothing you have done is lost. Answers are saved as you choose them, and every score
            already recorded stays exactly as it was.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={reset} className="btn btn-primary px-6 py-3">Try again</button>
            <Link href="/dashboard" className="btn btn-quiet px-6 py-3">Back to the dashboard</Link>
          </div>
          {error.digest && (
            <p className="numeral mt-6 text-xs text-ink-faint">
              Reference {error.digest}. Your admin can look it up in the server log.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
