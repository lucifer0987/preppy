import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, Nunito } from 'next/font/google'
import './globals.css'

/**
 * Three faces, each with a job.
 *
 * Nunito carries the display weight -- headlines, buttons, scores, the labels
 * that shout. It is a rounded sans, and the rounding is the point: this is a
 * nightly game with a leaderboard, and a neutral grotesque said "form" where
 * the product wanted "play". The rounder end of that choice (Fredoka, Baloo)
 * reads as a children's app, and the people using this are final-year CSE
 * students and working engineers, so Nunito is as warm as it goes before it
 * stops being for adults.
 *
 * IBM Plex Sans reads the questions. A single grotesque doing both was the
 * problem: a display face is built to be looked at, and a student reads forty
 * comprehension lines under a clock. Plex is humanist, opens up at small sizes,
 * and its technical register suits an exam whose subject is computer science.
 *
 * Plex Mono is for figures that must not move: the section timer, scores,
 * ranks. A proportional 1 next to a proportional 8 makes a counting-down clock
 * jitter, which is exactly when nobody should be distracted.
 *
 * next/font serves all three from this app, so no request reaches Google at run
 * time and there is no layout shift while a webfont loads.
 */
const nunito = Nunito({
  subsets: ['latin'], weight: ['600', '700', '800', '900'],
  variable: '--font-nunito', display: 'swap',
})
const plex = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'],
  variable: '--font-plex', display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono', display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Preppy', template: '%s · Preppy' },
  description: 'Daily mock tests for IBPS Specialist Officer (IT).',
  applicationName: 'Preppy',
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The browser chrome follows the theme; one fixed colour leaves a light bar
  // above a dark page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#46178f' },
    { media: '(prefers-color-scheme: dark)', color: '#110d18' },
  ],
}

/**
 * Stamps the saved theme on <html> before the first paint.
 *
 * It has to be an inline script in the head: anything that runs after hydration
 * paints the wrong theme first, and a white flash on the way into a dark page at
 * five to ten is worse than no toggle at all.
 *
 * There are two themes and no "system" state, so this always stamps a concrete
 * value. With nothing stored it reads the operating system once, to pick a
 * first impression rather than to hand over control -- from then on the switch
 * is the only thing that decides. Wrapped in try/catch because localStorage
 * throws outright in a locked-down browser; that path stamps light, which is
 * also what a browser with no JavaScript gets from the bare :root palette.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('preppy-theme');
if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t)}catch(e){
document.documentElement.setAttribute('data-theme','light')}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${plex.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
