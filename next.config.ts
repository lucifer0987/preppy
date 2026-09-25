import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    // Next caps Server Action bodies at 1 MB by default. A paper carrying
    // diagrams for a DI set or a puzzle easily passes that, and the framework
    // rejects it with an error the admin cannot act on.
    //
    // Set deliberately above the upload action's own 10 MB ceiling: multipart
    // boundaries and part headers add overhead to the raw body, so an equal
    // limit would let the framework reject a file the action would have
    // explained. The action's message should always be the one that wins.
    serverActions: { bodySizeLimit: '11mb' },
  },
  // pdfjs-dist and pdfkit are used only by the paper-ingestion scripts and the
  // admin upload route; keep them out of the client bundle.
  serverExternalPackages: ['pdfjs-dist', 'pdfkit'],
}

export default config
