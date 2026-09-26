#!/usr/bin/env tsx
/**
 * Risk R7: the key that bypasses every access rule must never reach the browser.
 *
 * Runs after `next build` and fails the build if anything shipped to clients --
 * everything under .next/static -- mentions that key's variable name, its
 * distinctive prefix, or the key itself. `server-only` on lib/supabase/* already
 * turns the likely mistake into a build error; this catches the unlikely ones.
 *
 * Both generations are covered. Supabase is replacing `service_role` with
 * `sb_secret_...` keys, and a scan that only knew the old variable name would
 * have found nothing at all once the key in use was a new one.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = '.next/static'

/** Names and shapes: always checkable, with or without a configured key. */
const STATIC_NEEDLES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'sb_secret_']

/**
 * The key's own value, which is the finding that actually matters. Only possible
 * when this process can see the key, which is why package.json passes
 * --env-file-if-exists to this script as well as to preflight.
 */
const valueNeedles = [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]
  .map((v) => v?.trim() ?? '')
  .filter((v) => v.length >= 20)

// Deduped: the same key is often set under both names, and a value beginning
// sb_secret_ would otherwise be reported once for the prefix and again for
// itself, which reads as two problems rather than one.
const needles = [...new Set([...STATIC_NEEDLES, ...valueNeedles])]

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
      const isValue = valueNeedles.includes(needle)
      hits.push(`${path}: contains ${isValue ? 'the secret key itself' : needle}`)
    }
  }

  if (hits.length) {
    console.error('\nThe secret key, or its name, is in the client bundle (risk R7):\n')
    for (const h of hits) console.error(`  ${h}`)
    console.error('\nFind the client component that imports server code and remove the import.')
    if (valueNeedles.length) {
      console.error('If the key itself was found, treat it as public: rotate it in the')
      console.error('Supabase dashboard under Settings -> API Keys.')
    }
    console.error('')
    process.exit(1)
  }

  // Nothing scanned is not a pass. An empty or half-written .next/static would
  // otherwise report success having checked nothing at all, which is the one
  // outcome a guard like this must never produce.
  if (scanned === 0) {
    console.error(
      `\ncheck-bundle: found ${ROOT} but no client files in it, so nothing was checked.\n\n` +
      '  Treating that as a failure rather than a pass. Build again and re-run.\n',
    )
    process.exit(1)
  }

  // Say which checks ran. Without a key in the environment this has compared
  // names and prefixes only, and reporting that as a clean bill of health would
  // overstate it.
  console.log(`check-bundle: ${scanned} client files scanned, no secret key found.`)
  if (!valueNeedles.length) {
    console.log('  note: no secret key in this environment, so names and the sb_secret_ prefix')
    console.log('        were checked but the key\'s own value could not be. A build with')
    console.log('        .env.local present checks that too.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
