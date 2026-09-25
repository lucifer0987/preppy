import { createRequire } from 'node:module'
import type { Issue } from './types'

/**
 * PDF text-layer extraction (PRD §7, R1).
 *
 * The grammar parser is line-based, so the only job that matters here is
 * faithfully rebuilding lines from the positioned glyph runs a PDF stores.
 * Naive concatenation of text items collapses the document into one long
 * string and destroys the grammar, so items are grouped by baseline and
 * ordered by x-offset.
 */

const SCAN_CHARS_PER_PAGE = 120

export interface ExtractResult {
  text: string
  pages: number
  issues: Issue[]
  charsPerPage: number[]
}

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

export async function extractPdfText(data: Uint8Array): Promise<ExtractResult> {
  const require = createRequire(import.meta.url)
  const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  const pdfjs = await import(pdfjsPath)

  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise

  const issues: Issue[] = []
  const pageTexts: string[] = []
  const charsPerPage: number[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = (content.items as TextItem[]).filter((it) => typeof it.str === 'string')
    const text = rebuildLines(items)
    pageTexts.push(text)
    charsPerPage.push(text.replace(/\s/g, '').length)
    page.cleanup()
  }
  await doc.destroy()

  const documentChars = charsPerPage.reduce((a, b) => a + b, 0)
  charsPerPage.forEach((n, i) => {
    // The final page routinely holds only the tail of the document (a closing
    // brace, a footer), so a short last page is not evidence of a scan.
    const isTail = i === charsPerPage.length - 1 && documentChars > SCAN_CHARS_PER_PAGE * 2
    if (n < SCAN_CHARS_PER_PAGE && !isTail) {
      issues.push({
        severity: 'warning',
        path: null,
        code: 'PAGE_LOW_TEXT',
        message: `Page ${i + 1} yielded only ${n} characters. This usually means the page is a scan or an image, and OCR is not supported.`,
      })
    }
  })

  if (charsPerPage.every((n) => n < SCAN_CHARS_PER_PAGE)) {
    issues.push({
      severity: 'error',
      path: null,
      code: 'PDF_NO_TEXT_LAYER',
      message: 'No usable text layer was found in this PDF. Scanned or image-only PDFs are rejected — export a text-based PDF instead.',
    })
  }

  return { text: pageTexts.join('\n'), pages: doc.numPages, issues, charsPerPage }
}

/**
 * Group positioned text runs back into lines.
 * PDF y-origin is bottom-left, so lines sort by descending y.
 */
function rebuildLines(items: TextItem[]): string {
  if (!items.length) return ''

  const heights = items.map((i) => Math.abs(i.height) || 10).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 10
  // Two runs belong to the same line when their baselines are within ~half a line.
  const yTolerance = Math.max(2, medianHeight * 0.5)

  type Row = { y: number; items: TextItem[] }
  const rows: Row[] = []

  for (const item of items) {
    if (!item.str) continue
    const y = item.transform[5] ?? 0
    const row = rows.find((r) => Math.abs(r.y - y) <= yTolerance)
    if (row) {
      row.items.push(item)
      // Keep the row anchored to its topmost baseline for stable comparison.
      row.y = (row.y + y) / 2
    } else {
      rows.push({ y, items: [item] })
    }
  }

  rows.sort((a, b) => b.y - a.y)

  return rows
    .map((row) => {
      row.items.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
      let out = ''
      let prevEnd: number | null = null
      for (const it of row.items) {
        const x = it.transform[4] ?? 0
        const gap = prevEnd === null ? 0 : x - prevEnd
        // Insert a space when the visual gap exceeds a quarter of the line height
        // and the neighbouring characters do not already supply one.
        if (prevEnd !== null && gap > medianHeight * 0.25 && !/\s$/.test(out) && !/^\s/.test(it.str)) {
          out += ' '
        }
        out += it.str
        prevEnd = x + (it.width ?? 0)
      }
      return out.replace(/[ \t]+/g, ' ').trimEnd()
    })
    .join('\n')
}
