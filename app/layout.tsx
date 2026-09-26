import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

/**
 * Three faces, each with a job.
 *
 * Archivo carries the display weight the PRD asked for -- headlines, buttons,
 * the labels that shout. It is a grotesque, and at 800 and 900 it has the
 * energy the product wants.
 *
 * IBM Plex Sans reads the questions. A single grotesque doing both was the
 * problem: Archivo is built to be looked at, and a student reads forty
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
const archivo = Archivo({
  subsets: ['latin'], weight: ['600', '700', '800', '900'],
  variable: '--font-archivo', display: 'swap',
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
 * "system" writes no attribute, which is what leaves prefers-color-scheme in
 * charge -- the CSS is built around that being the un-stamped default. Wrapped in
 * try/catch because localStorage throws outright in a locked-down browser.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('preppy-theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plex.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
