#!/usr/bin/env tsx
/**
 * Preppy paper checker.
 *
 *   npm run check -- <paper.pdf|paper.json> [--images <dir>] [--json]
 *
 * Reads a paper in the fixed JSON format, repairs the damage a PDF text layer
 * inflicts on JSON, validates it, and prints the report an admin sees before
 * publishing.
 */
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { extractPdfText } from '../lib/extract.js'
import { readPaper, summarise } from '../lib/paper.js'
import { PATTERN, SECTION_NAMES, type Issue, type SectionCode } from '../lib/types.js'

const T = process.stdout.isTTY
const E = String.fromCharCode(27)
const C = {
  dim: T ? `${E}[2m` : '', red: T ? `${E}[31m` : '', yellow: T ? `${E}[33m` : '',
  green: T ? `${E}[32m` : '', blue: T ? `${E}[34m` : '', bold: T ? `${E}[1m` : '', off: T ? `${E}[0m` : '',
}

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : undefined
}

/** Shown when the command is run with no file, which is the usual first try. */
function usage() {
  console.error(`
Check a Preppy paper before publishing it.

  npm run check <paper.pdf>          a paper exported to PDF
  npm run check <paper.json>         the JSON on its own, before exporting

Options
  --images <dir>   folder holding the images the paper references
  --json           machine-readable output

Try one of these:
  npm run check format/sample.pdf      a complete worked paper
  npm run check format/template.json   the fill-in skeleton

The format is documented in format/README.md.
Exit codes: 0 publishable, 1 blocking errors, 2 bad usage.
`)
}

async function main() {
  const imagesDir = arg('--images')
  const file = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== imagesDir)
  if (!file) {
    usage()
    process.exit(2)
  }
  if (!existsSync(file)) {
    console.error(`\nNo such file: ${file}\n`)
    usage()
    process.exit(2)
  }

  const availableImages = imagesDir && existsSync(imagesDir) ? await readdir(imagesDir) : []
  const isPdf = extname(file).toLowerCase() === '.pdf'

  let raw: string
  let extractIssues: Issue[] = []
  let pages = 0
  let chars: number[] = []

  if (isPdf) {
    const res = await extractPdfText(new Uint8Array(await readFile(file)))
    raw = res.text
    extractIssues = res.issues
    pages = res.pages
    chars = res.charsPerPage
  } else {
    raw = await readFile(file, 'utf8')
  }

  const { paper, issues, repairs } = readPaper(raw, { availableImages })
  const all = [...extractIssues, ...issues]
  const { errors, warnings, publishable } = summarise(all)

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ file, publishable, repairs, issues: all, paper }, null, 2))
    process.exit(publishable ? 0 : 1)
  }

  console.log(`\n${C.bold}${basename(file)}${C.off}`)
  if (isPdf) {
    console.log(`${C.dim}${pages} page(s) - ${chars.reduce((a, b) => a + b, 0)} characters extracted${C.off}`)
  }

  if (repairs.length) {
    console.log(`\n${C.blue}${C.bold}Repaired on the way in${C.off} ${C.dim}(the PDF text layer damaged the JSON)${C.off}`)
    for (const r of repairs) {
      console.log(`  ${C.blue}${String(r.count).padStart(4)}x${C.off}  ${C.dim}${r.kind.padEnd(22)}${C.off} ${r.detail ?? ''}`)
    }
  }

  if (paper) {
    console.log(`\n${C.dim}date ${paper.date} - ${paper.title ?? 'untitled'}${C.off}`)
    let totalQ = 0
    let totalMin = 0
    for (const s of paper.sections) {
      const code = s.code as SectionCode
      const mins = s.durationMinutes ?? PATTERN[code].minutes
      const dirs = s.directions?.length ?? 0
      const tables = s.directions?.filter((d) => d.table).length ?? 0
      const solved = s.questions.filter((q) => q.solution).length
      totalQ += s.questions.length
      totalMin += mins
      console.log(
        `  ${C.bold}${SECTION_NAMES[code].padEnd(30)}${C.off}` +
        `${String(s.questions.length).padStart(2)} q | ${String(mins).padStart(2)} min | ` +
        `+${s.marksCorrect ?? 1}/-${s.marksNegative ?? 0.25} | ${solved}/${s.questions.length} solved` +
        (dirs ? ` | ${dirs} directions${tables ? `, ${tables} table` : ''}` : ''),
      )
    }
    console.log(`  ${C.dim}${''.padEnd(30)}${String(totalQ).padStart(2)} q | ${totalMin} min total${C.off}`)
  }

  const show = (list: Issue[], colour: string, label: string) => {
    if (!list.length) return
    console.log(`\n${colour}${C.bold}${list.length} ${label}${list.length === 1 ? '' : 's'}${C.off}`)
    for (const i of list) {
      console.log(`  ${colour}${(i.path ?? 'document').padEnd(34)}${C.off} ${C.dim}${i.code.padEnd(24)}${C.off} ${i.message}`)
      if (i.excerpt) console.log(`    ${C.dim}> ...${i.excerpt}...${C.off}`)
    }
  }
  show(errors, C.red, 'blocking error')
  show(warnings, C.yellow, 'warning')

  console.log(
    publishable
      ? `\n${C.green}${C.bold}Publishable${C.off}${warnings.length ? ` ${C.dim}(with ${warnings.length} warning${warnings.length === 1 ? '' : 's'})${C.off}` : ''}\n`
      : `\n${C.red}${C.bold}Not publishable - fix the ${errors.length} blocking error${errors.length === 1 ? '' : 's'} above.${C.off}\n`,
  )
  process.exit(publishable ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
