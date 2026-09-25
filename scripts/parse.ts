#!/usr/bin/env tsx
/**
 * Preppy paper checker.
 *
 *   npm run parse -- <file.pdf|file.txt> [--images <dir>] [--json]
 *
 * Extracts, parses and validates a paper, then prints the report an admin
 * would see before the preview step (PRD §6.9.1).
 */
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { extractPdfText } from '../lib/extract.js'
import { parseTestDocument } from '../lib/parser.js'
import { summarise, validateTest } from '../lib/validate.js'
import { SECTION_NAMES, type Issue } from '../lib/types.js'

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', yellow: '', green: '', bold: '', off: '' }

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== arg('--images'))
  if (!file) {
    console.error('usage: npm run parse -- <file.pdf|file.txt> [--images <dir>] [--json]')
    process.exit(2)
  }
  if (!existsSync(file)) {
    console.error(`No such file: ${file}`)
    process.exit(2)
  }

  const imagesDir = arg('--images')
  const availableImages = imagesDir && existsSync(imagesDir) ? await readdir(imagesDir) : []

  const isPdf = extname(file).toLowerCase() === '.pdf'
  let raw: string
  let extractIssues: Issue[] = []
  let pages = 0
  let charsPerPage: number[] = []

  if (isPdf) {
    const buf = await readFile(file)
    const res = await extractPdfText(new Uint8Array(buf))
    raw = res.text
    extractIssues = res.issues
    pages = res.pages
    charsPerPage = res.charsPerPage
  } else {
    raw = await readFile(file, 'utf8')
  }

  const { test, issues: parseIssues } = parseTestDocument(raw)
  const validateIssues = validateTest(test, { availableImages })
  const all = [...extractIssues, ...parseIssues, ...validateIssues]
  const { errors, warnings, publishable } = summarise(all)

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ file, test, issues: all, publishable }, null, 2))
    process.exit(publishable ? 0 : 1)
  }

  // ---- report
  const qTotal = test.sections.reduce((a, s) => a + s.questions.length, 0)
  console.log(`\n${C.bold}${basename(file)}${C.off}`)
  if (isPdf) {
    console.log(`${C.dim}${pages} page(s) · ${charsPerPage.reduce((a, b) => a + b, 0)} chars extracted (${charsPerPage.join(', ')} per page)${C.off}`)
  }
  console.log(`${C.dim}date ${test.date ?? '—'} · title ${test.title ?? '—'} · ${qTotal} questions${C.off}\n`)

  for (const s of test.sections) {
    const dirCount = new Set(s.questions.map((q) => q.directionBlockIndex).filter((i) => i !== null)).size
    const withSol = s.questions.filter((q) => q.solution).length
    console.log(
      `  ${C.bold}${SECTION_NAMES[s.code].padEnd(30)}${C.off}` +
      `${String(s.questions.length).padStart(2)} q · ${String(s.durationMinutes).padStart(2)} min · ` +
      `+${s.marksCorrect}/−${s.marksNegative} · ${withSol}/${s.questions.length} solved` +
      (dirCount ? ` · ${dirCount} direction block(s)` : ''),
    )
  }
  if (test.referencedImages.length) {
    console.log(`\n  ${C.dim}images referenced: ${test.referencedImages.join(', ')}${C.off}`)
  }

  const show = (list: Issue[], colour: string, label: string) => {
    if (!list.length) return
    console.log(`\n${colour}${C.bold}${list.length} ${label}${list.length === 1 ? '' : 's'}${C.off}`)
    for (const i of list) {
      const where = i.line ? `line ${String(i.line).padStart(4)}` : '   doc   '
      console.log(`  ${colour}${where}${C.off}  ${C.dim}${i.code.padEnd(26)}${C.off} ${i.message}`)
      if (i.excerpt) console.log(`             ${C.dim}> ${i.excerpt}${C.off}`)
    }
  }
  show(errors, C.red, 'blocking error')
  show(warnings, C.yellow, 'warning')

  console.log(
    publishable
      ? `\n${C.green}${C.bold}✓ Publishable${C.off}${warnings.length ? ` ${C.dim}(with ${warnings.length} warning${warnings.length === 1 ? '' : 's'})${C.off}` : ''}\n`
      : `\n${C.red}${C.bold}✗ Not publishable — fix the ${errors.length} blocking error${errors.length === 1 ? '' : 's'} above.${C.off}\n`,
  )
  process.exit(publishable ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
