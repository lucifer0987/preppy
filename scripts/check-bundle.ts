#!/usr/bin/env tsx
/**
 * Risk R7: the service-role key must never reach the browser.
 *
 * Runs after `next build` (npm run build) and fails the build if anything
 * shipped to clients — everything under .next/static — mentions the key's
 * variable name or, when it is set in this environment, the key itself.
 * `server-only` on lib/supabase/* already turns the likely mistake into a
 * build error; this catches the unlikely ones.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = '.next/static'
const needles = ['SUPABASE_SERVICE_ROLE_KEY']
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (key && key.length >= 20) needles.push(key)

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

async function main() {
  let scanned = 0
  const hits: string[] = []
  for await (const path of files(ROOT)) {
    if (!/\.(js|mjs|css|html|json|map)$/.test(path)) continue
    scanned++
    const text = await readFile(path, 'utf8')
    for (const needle of needles) {
      if (text.includes(needle)) hits.push(`${path}: contains ${needle === key ? 'the service-role key itself' : needle}`)
    }
  }
  if (hits.length) {
    console.error('\nThe service-role key, or its name, is in the client bundle (risk R7):\n')
    for (const h of hits) console.error(`  ${h}`)
    console.error('\nFind the client component that imports server code and remove the import.\n')
    process.exit(1)
  }
  console.log(`check-bundle: ${scanned} client files scanned, no service-role key found.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
