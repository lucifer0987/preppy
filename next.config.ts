import type { NextConfig } from 'next'

const config: NextConfig = {
  // pdfjs-dist and pdfkit are used only by the paper-ingestion scripts and the
  // admin upload route; keep them out of the client bundle.
  serverExternalPackages: ['pdfjs-dist', 'pdfkit'],
}

export default config
