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
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = '.next/static'
// Both namings, and both key shapes. Scanning only for the legacy name would
// have found nothing at all once the key in use is an sb_secret_ one.
const needles = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'sb_secret_']
for (const key of [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]) {
  const trimmed = key?.trim()
  if (trimmed && trimmed.length >= 20) needles.push(trimmed)
}

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

async function main() {
  // A missing build is a raw ENOENT stack otherwise, and the fix is not
  // obvious from it: this runs as the last step of build:local / build:prod.
  if (!existsSync(ROOT)) {
    console.error(
      `\ncheck-bundle: there is no ${ROOT} to scan.\n\n` +
      '  Build first -- this runs as the last step of `npm run build:local`\n' +
      '  and `npm run build:prod`, and has nothing to look at on its own.\n',
    )
    process.exit(1)
  }

  let scanned = 0
  const hits: string[] = []
  for await (const path of files(ROOT)) {
    if (!/\.(js|mjs|css|html|json|map)$/.test(path)) continue
    scanned++
    const text = await readFile(path, 'utf8')
    for (const needle of needles) {
      if (!text.includes(needle)) continue
      // A long needle that is not a variable name is the key's own value,
      // which is the worse of the two findings.
      const isValue = needle.length >= 20 && !needle.startsWith('SUPABASE_')
      hits.push(`${path}: contains ${isValue ? 'the secret key itself' : needle}`)
    }
  }
  if (hits.length) {
    console.error('\nThe secret key, or its name, is in the client bundle (risk R7):\n')
    for (const h of hits) console.error(`  ${h}`)
    console.error('\nFind the client component that imports server code and remove the import.\n')
    process.exit(1)
  }
  // Nothing scanned is not a pass. An empty or half-written .next/static
  // would otherwise report success having checked nothing at all, which is
  // the one outcome a guard like this must never produce.
  if (scanned === 0) {
    console.error(
      `\ncheck-bundle: found ${ROOT} but no client files in it, so nothing was checked.\n\n` +
      '  Treating that as a failure rather than a pass. Build again and re-run.\n',
    )
    process.exit(1)
  }
  console.log(`check-bundle: ${scanned} client files scanned, no secret key found.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
