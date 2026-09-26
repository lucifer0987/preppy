#!/usr/bin/env tsx
/**
 * Writes format/template.json from the pattern the product shipped with.
 *
 * The admin console's Paper pattern screen offers the same thing built from
 * whatever the pattern has been changed to; this is the copy kept in the repo,
 * so it stays the shipped default on purpose.
 */
import { writeFile } from 'node:fs/promises'
import { buildTemplate, templateQuestionCount } from '../lib/template'
import { DEFAULT_PATTERN } from '../lib/types'

async function main() {
  const template = buildTemplate(DEFAULT_PATTERN)
  await writeFile('format/template.json', JSON.stringify(template, null, 2) + '\n')
  const n = templateQuestionCount(template)
  console.log(`wrote format/template.json - ${n} placeholder questions, Q1-Q${n}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
