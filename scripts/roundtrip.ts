#!/usr/bin/env tsx
/**
 * Fidelity check: does a paper survive a trip through PDF text extraction?
 * Parses the .txt source and the .pdf render, then diffs the structured output.
 * Whitespace is normalised; anything else that differs is real signal loss.
 */
import { readFile } from 'node:fs/promises'
import { extractPdfText } from '../lib/extract.js'
import { parseTestDocument } from '../lib/parser.js'
import type { ParsedTest } from '../lib/types.js'

const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()

function flatten(t: ParsedTest) {
  const rows: Record<string, string> = {}
  rows['date'] = norm(t.date)
  rows['title'] = norm(t.title)
  for (const s of t.sections) {
    rows[`section.${s.code}.duration`] = String(s.durationMinutes)
    rows[`section.${s.code}.marks`] = `${s.marksCorrect}/${s.marksNegative}`
    for (const q of s.questions) {
      rows[`Q${q.number}.text`] = norm(q.text)
      rows[`Q${q.number}.ans`] = norm(q.correctOption)
      rows[`Q${q.number}.sol`] = norm(q.solution)
      rows[`Q${q.number}.tag`] = norm(q.tag)
      rows[`Q${q.number}.diff`] = norm(q.difficulty)
      rows[`Q${q.number}.dir`] = String(q.directionBlockIndex)
      q.options.forEach((o) => { rows[`Q${q.number}.opt.${o.label}`] = norm(o.text) })
    }
  }
  t.directionBlocks.forEach((b, i) => {
    rows[`dir${i}.range`] = `Q${b.qFrom}-Q${b.qTo}`
    rows[`dir${i}.content`] = norm(b.content)
  })
  return rows
}

async function main() {
  const txtPath = process.argv[2]
  const pdfPath = process.argv[3]
  if (!txtPath || !pdfPath) {
    console.error('usage: tsx scripts/roundtrip.ts <src.txt> <render.pdf>')
    process.exit(2)
  }

  const a = flatten(parseTestDocument(await readFile(txtPath, 'utf8')).test)
  const pdfBuf = await readFile(pdfPath)
  const extracted = await extractPdfText(new Uint8Array(pdfBuf))
  const b = flatten(parseTestDocument(extracted.text).test)

  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const diffs: string[] = []
  for (const k of keys) {
    const av = a[k] ?? '<missing>'
    const bv = b[k] ?? '<missing>'
    if (av !== bv) diffs.push(`  ${k}\n     txt: ${av}\n     pdf: ${bv}`)
  }

  console.log(`\ncompared ${keys.length} fields across ${Object.keys(a).length} source entries`)
  if (!diffs.length) {
    console.log('PASS - identical after whitespace normalisation.')
    console.log('Every question, option, answer key, solution, tag, difficulty and')
    console.log('directions block survived PDF text extraction intact.\n')
    process.exit(0)
  }
  console.log(`FAIL - ${diffs.length} field(s) differ\n${diffs.join('\n')}\n`)
  process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(2) })
