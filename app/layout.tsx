import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'
import './globals.css'

/**
 * The display face (PRD 8: bold display typography). next/font serves it from
 * this app, so no request goes to Google at run time.
 */
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '600', '700', '800', '900'], variable: '--font-archivo', display: 'swap' })

export const metadata: Metadata = {
  title: 'Preppy',
  description: 'Daily mock tests for IBPS Specialist Officer (IT).',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#46178f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
