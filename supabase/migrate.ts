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
    '  Either set it (Supabase dashboard -> Connect -> Session pooler),\n' +
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
  const message = (e as Error).message
  console.error(`\n  Migration failed: ${message}\n`)

  // The two failures that are not about the SQL, and whose messages say
  // nothing about the actual cause.
  if (/ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ECONNREFUSED|timeout/i.test(message)) {
    console.error(
      '  Could not reach the database at all, so this is the connection string\n' +
      '  rather than the migration.\n\n' +
      '  The most common cause: the DIRECT connection is IPv6-only unless you pay\n' +
      '  for the IPv4 add-on, and most home and office networks are IPv4. Use the\n' +
      '  SESSION POOLER instead -- Supabase dashboard, "Connect" at the top,\n' +
      '  Session pooler. Its username has the project ref in it:\n\n' +
      '    postgresql://postgres.[REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres\n\n' +
      '  Not the Transaction pooler on 6543: it has no prepared statements.\n' +
      '  No connection string at all? `npm run migrate -- --print` gives you the\n' +
      '  SQL to paste into the Supabase SQL editor.\n',
    )
  } else if (/password authentication failed|SASL|SCRAM/i.test(message)) {
    console.error(
      '  The database rejected the password. It is the database password set when\n' +
      '  the project was created, not your Supabase account password and not the\n' +
      '  service-role key. Reset it under Settings -> Database if it is lost, and\n' +
      '  remember to URL-encode any @ : / or # in it.\n',
    )
  } else {
    console.error('  Nothing from the failing migration was kept. Fix it and run again.\n')
  }
  process.exit(1)
})
