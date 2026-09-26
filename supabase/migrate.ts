#!/usr/bin/env tsx
/**
 * Applies pending migrations from supabase/migrations, in filename order.
 *
 *   npm run migrate              apply anything pending
 *   npm run migrate -- --status  list what is applied and what is not
 *   npm run migrate -- --print   print the pending SQL instead of running it
 *
 * Forward only. There are no down migrations: reversing a schema change
 * correctly is rare, and a down file that has never been run is a false
 * promise. To undo something, write the next migration.
 *
 * Needs DATABASE_URL, from Supabase -> Settings -> Database -> Connection
 * string (the "URI" one). Without it the runner prints what to paste into the
 * SQL editor instead, so nothing is blocked on having that string to hand.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = new URL('./migrations/', import.meta.url).pathname
const TRACKING = `
  create table if not exists schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  );
`

interface Migration { version: string; name: string; sql: string }

async function load(): Promise<Migration[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()
  return Promise.all(files.map(async (f) => ({
    version: f.replace(/\.sql$/, '').split('_')[0]!,
    name: f,
    sql: await readFile(join(DIR, f), 'utf8'),
  })))
}

function printPending(pending: Migration[]) {
  console.log(
    '\n  No DATABASE_URL set, so nothing was run.\n\n' +
    '  Either set it (Supabase -> Settings -> Database -> Connection string),\n' +
    '  or paste the SQL below into the Supabase SQL editor in this order.\n' +
    '  The last statement of each block is what records it as applied.\n',
  )
  for (const m of pending) {
    console.log(`\n${'-'.repeat(70)}\n-- ${m.name}\n${'-'.repeat(70)}\n`)
    console.log(m.sql.trimEnd())
    console.log(`\ninsert into schema_migrations (version) values ('${m.version}')\n  on conflict (version) do nothing;\n`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const all = await load()
  if (!all.length) { console.log('  No migrations found.'); return }

  const url = process.env.DATABASE_URL
  if (!url) {
    if (args.includes('--status')) {
      console.log('\n  Cannot check status without DATABASE_URL. Files on disk:\n')
      for (const m of all) console.log(`    ${m.name}`)
      console.log()
      return
    }
    printPending(all)
    return
  }

  const postgres = (await import('postgres')).default
  const sql = postgres(url, { max: 1, onnotice: () => {} })

  try {
    await sql.unsafe(TRACKING)
    const rows = await sql<{ version: string }[]>`select version from schema_migrations`
    const applied = new Set(rows.map((r) => r.version))
    const pending = all.filter((m) => !applied.has(m.version))

    if (args.includes('--status')) {
      console.log('')
      for (const m of all) {
        console.log(`    ${applied.has(m.version) ? 'applied ' : 'PENDING '}  ${m.name}`)
      }
      console.log(`\n  ${applied.size} applied, ${pending.length} pending.\n`)
      return
    }

    if (!pending.length) { console.log('\n  Up to date. Nothing to apply.\n'); return }

    if (args.includes('--print')) { printPending(pending); return }

    console.log(`\n  Applying ${pending.length} migration${pending.length === 1 ? '' : 's'}...\n`)
    for (const m of pending) {
      // Each migration runs inside its own transaction, so a failure leaves
      // the database on the last complete version rather than part-way.
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql)
        await tx`insert into schema_migrations (version) values (${m.version})`
      })
      console.log(`    applied  ${m.name}`)
    }
    console.log(`\n  Done. ${applied.size + pending.length} migrations applied in total.\n`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(`\n  Migration failed: ${(e as Error).message}\n`)
  console.error('  Nothing from the failing migration was kept. Fix it and run again.\n')
  process.exit(1)
})
