import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { extractPdfText } from '../lib/extract.js'
import { parseTestDocument } from '../lib/parser.js'
import { summarise, validateTest } from '../lib/validate.js'

const PDF = 'docs/sample.pdf'

describe.skipIf(!existsSync(PDF))('PDF round trip', () => {
  it('survives extraction with every field intact', async () => {
    const fromText = parseTestDocument(readFileSync('docs/sample.txt', 'utf8')).test
    const extracted = await extractPdfText(new Uint8Array(readFileSync(PDF)))
    const fromPdf = parseTestDocument(extracted.text).test

    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()
    const a = fromText.sections.flatMap((s) => s.questions)
    const b = fromPdf.sections.flatMap((s) => s.questions)

    expect(b).toHaveLength(a.length)
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!
      const y = b[i]!
      expect(y.number).toBe(x.number)
      expect(norm(y.text)).toBe(norm(x.text))
      expect(y.correctOption).toBe(x.correctOption)
      expect(norm(y.solution)).toBe(norm(x.solution))
      expect(y.options.map((o) => `${o.label}:${norm(o.text)}`))
        .toEqual(x.options.map((o) => `${o.label}:${norm(o.text)}`))
    }
    expect(fromPdf.directionBlocks).toHaveLength(fromText.directionBlocks.length)
  })

  it('is publishable straight from the PDF', async () => {
    const extracted = await extractPdfText(new Uint8Array(readFileSync(PDF)))
    const { test, issues } = parseTestDocument(extracted.text)
    const { errors } = summarise([...extracted.issues, ...issues, ...validateTest(test)])
    expect(errors, errors.map((e) => `${e.code}: ${e.message}`).join('\n')).toHaveLength(0)
  })

  it('rejects a PDF with no text layer', async () => {
    // A syntactically valid but empty PDF stands in for a scan.
    const empty = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
      'trailer<</Root 1 0 R>>\n', 'latin1')
    const res = await extractPdfText(new Uint8Array(empty)).catch(() => null)
    if (res) expect(res.issues.some((i) => i.code === 'PDF_NO_TEXT_LAYER')).toBe(true)
  })
})
