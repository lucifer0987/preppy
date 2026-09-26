import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/**
 * The migration chain, applied the way the runner applies it: in filename
 * order, each recorded in schema_migrations. Proves the ordering is right and
 * that re-running is a no-op, which is what makes it safe to point at
 * production.
 */
const DIR = 'supabase/migrations'
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

let db: PGlite

const applied = async () =>
  (await db.query<{ version: string }>('select version from schema_migrations order by version')).rows.map((r) => r.version)

async function runPending() {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key, applied_at timestamptz not null default now())`)
  const done = new Set(await applied())
  let count = 0
  for (const f of files) {
    const version = f.split('_')[0]!
    if (done.has(version)) continue
    await db.exec(readFileSync(`${DIR}/${f}`, 'utf8'))
    await db.query('insert into schema_migrations (version) values ($1)', [version])
    count++
  }
  return count
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
  `)
})

describe('the migration chain', () => {
  it('is numbered without gaps or duplicates', () => {
    const versions = files.map((f) => f.split('_')[0]!)
    expect(new Set(versions).size).toBe(versions.length)
    versions.forEach((v, i) => expect(Number(v)).toBe(i + 1))
  })

  it('applies every file in order', async () => {
    expect(await runPending()).toBe(files.length)
    expect(await applied()).toEqual(files.map((f) => f.split('_')[0]))
  })

  it('does nothing on a second run', async () => {
    // What makes it safe to point at production: the runner skips what is
    // recorded, and each file is written to be harmless if run again anyway.
    expect(await runPending()).toBe(0)
    expect(await applied()).toEqual(files.map((f) => f.split('_')[0]))
  })

  it('leaves the database the app expects', async () => {
    const tables = (await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`)).rows.map((r) => r.table_name)
    expect(tables).toContain('app_settings')
    expect(tables).toContain('attempts')
    expect(tables).toContain('schema_migrations')
  })
})
