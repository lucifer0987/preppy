#!/usr/bin/env tsx
/**
 * Fidelity check: does a paper survive PDF export and extraction unchanged?
 * Compares the source JSON against the JSON recovered from the rendered PDF,
 * field by field. Whitespace is normalised; anything else is real signal loss.
 */
import { readFile } from 'node:fs/promises'
import { extractPdfText } from '../lib/extract.js'
import { readPaper } from '../lib/paper.js'
import type { Paper } from '../lib/types.js'

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

function flatten(p: Paper) {
  const rows: Record<string, string> = {}
  rows['date'] = norm(p.date)
  rows['title'] = norm(p.title)
  for (const s of p.sections) {
    const sp = `section.${s.code}`
    rows[`${sp}.duration`] = norm(s.durationMinutes)
    rows[`${sp}.marks`] = `${norm(s.marksCorrect)}/${norm(s.marksNegative)}`
    s.directions?.forEach((d, i) => {
      rows[`${sp}.dir${i}.range`] = `Q${d.from}-Q${d.to}`
      rows[`${sp}.dir${i}.text`] = norm(d.text)
      if (d.table) {
        rows[`${sp}.dir${i}.table.headers`] = d.table.headers.join('|')
        d.table.rows.forEach((r, ri) => { rows[`${sp}.dir${i}.table.row${ri}`] = r.join('|') })
      }
    })
    for (const q of s.questions) {
      rows[`Q${q.number}.text`] = norm(q.text)
      rows[`Q${q.number}.answer`] = norm(q.answer)
      rows[`Q${q.number}.solution`] = norm(q.solution)
      rows[`Q${q.number}.tag`] = norm(q.tag)
      rows[`Q${q.number}.difficulty`] = norm(q.difficulty)
      for (const [k, v] of Object.entries(q.options)) rows[`Q${q.number}.opt.${k}`] = norm(v)
    }
  }
  return rows
}

async function main() {
  const jsonPath = process.argv[2]
  const pdfPath = process.argv[3]
  if (!jsonPath || !pdfPath) {
    console.error('usage: tsx scripts/roundtrip.ts <source.json> <rendered.pdf>')
    process.exit(2)
  }

  const src = readPaper(await readFile(jsonPath, 'utf8'))
  if (!src.paper) { console.error('source JSON is not valid'); process.exit(2) }

  const extracted = await extractPdfText(new Uint8Array(await readFile(pdfPath)))
  const out = readPaper(extracted.text)
  if (!out.paper) {
    console.error('FAIL - the PDF did not yield a valid paper')
    for (const i of out.issues.filter((x) => x.severity === 'error')) console.error(`  ${i.code}: ${i.message}`)
    process.exit(1)
  }

  const a = flatten(src.paper)
  const b = flatten(out.paper)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const diffs = keys
    .filter((k) => (a[k] ?? '<missing>') !== (b[k] ?? '<missing>'))
    .map((k) => `  ${k}\n     json: ${a[k] ?? '<missing>'}\n     pdf : ${b[k] ?? '<missing>'}`)

  console.log(`\nrepairs applied while reading the PDF:`)
  for (const r of out.repairs) console.log(`  ${String(r.count).padStart(4)}x  ${r.kind}`)
  console.log(`\ncompared ${keys.length} fields`)

  if (!diffs.length) {
    console.log('PASS - identical after whitespace normalisation.')
    console.log('Every question, option, answer, solution, tag, difficulty, directions')
    console.log('block and table cell survived the PDF round trip intact.\n')
    process.exit(0)
  }
  console.log(`FAIL - ${diffs.length} field(s) differ\n${diffs.join('\n')}\n`)
  process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(2) })
