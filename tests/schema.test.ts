import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { paperToRows, savePaperPayload } from '../lib/paper-rows'
import { readPaper } from '../lib/paper'

/**
 * supabase/schema.sql run on a real Postgres (PGlite, in process), so the
 * functions and guards the app depends on are exercised as SQL rather than
 * trusted. Supabase's own auth schema and roles are stubbed with just what the
 * schema touches.
 */

// Every migration, in order: the chain a real database actually walks, not a
// single file that might have drifted from it.
const migrationDir = 'supabase/migrations'
const migrations = readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort()
const schema = migrations.map((f) => readFileSync(`${migrationDir}/${f}`, 'utf8')).join('\n')
const sample = readPaper(readFileSync('format/sample.json', 'utf8')).paper!

let db: PGlite
const STUDENT = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!
const fails = async (sql: string, params: unknown[] = []) => {
  try { await db.query(sql, params) } catch (e) { return (e as Error).message }
  return null
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  `)
  await db.exec(schema)
  await db.exec(`
    insert into auth.users values ('${STUDENT}'), ('${OTHER}');
    insert into profiles (id, username, display_name) values
      ('${STUDENT}', 'student1', 'One'), ('${OTHER}', 'student2', 'Two');
  `)
}, 60_000)

const savePaper = async (date: string) => {
  const payload = JSON.stringify(savePaperPayload(paperToRows({ ...sample, date })))
  return (await one<{ r: { id: string; replaced_id: string | null } }>('select save_paper($1) as r', [payload])).r
}

describe('schema.sql', () => {
  it('applies twice without error, so it can be re-run safely', async () => {
    await db.exec(schema)
  })

  it('keeps every app function away from the anon and authenticated roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and has_function_privilege($1, p.oid, 'execute')
           and p.proname in ('save_paper','start_attempt','apply_rescore','revoke_user_sessions',
                             'bump_attempt_counter','rate_limit_hit','rate_limit_wait','rate_limit_clear')`, [role])
      expect(rows[0]!.n, role).toBe(0)
    }
  })
})

describe('save_paper', () => {
  it('writes the whole paper, with each question linked to its directions block', async () => {
    const { id } = await savePaper('2030-01-01')
    const q = await one<{ n: number }>('select count(*)::int as n from questions q join sections s on s.id = q.section_id where s.test_id = $1', [id])
    expect(q.n).toBe(55)
    const linked = await one<{ n: number }>(
      `select count(*)::int as n from questions q join sections s on s.id = q.section_id
       where s.test_id = $1 and q.direction_block_id is not null`, [id])
    expect(linked.n).toBe(15) // three blocks of five in sample.json
    const t = await one<{ status: string }>('select status from tests where id = $1', [id])
    expect(t.status).toBe('DRAFT')
  })

  it('replaces a draft for the same date and says which one it replaced', async () => {
    const first = await savePaper('2030-01-02')
    const second = await savePaper('2030-01-02')
    expect(second.replaced_id).toBe(first.id)
    expect((await one<{ n: number }>('select count(*)::int as n from tests where id = $1', [first.id])).n).toBe(0)
  })

  it('refuses to replace a scheduled paper, and changes nothing', async () => {
    const { id } = await savePaper('2030-01-03')
    await db.query(`update tests set status = 'SCHEDULED' where id = $1`, [id])
    const payload = JSON.stringify(savePaperPayload(paperToRows({ ...sample, date: '2030-01-03' })))
    expect(await fails('select save_paper($1)', [payload])).toMatch(/DATE_SCHEDULED/)
    expect((await one<{ id: string }>(`select id from tests where date = '2030-01-03'`)).id).toBe(id)
  })

  it('refuses to replace a draft students have sat', async () => {
    const { id } = await savePaper('2030-01-04')
    await db.query('select start_attempt($1, $2, false)', [id, STUDENT])
    const payload = JSON.stringify(savePaperPayload(paperToRows({ ...sample, date: '2030-01-04' })))
    expect(await fails('select save_paper($1)', [payload])).toMatch(/DRAFT_HAS_ATTEMPTS/)
  })
})

describe('start_attempt', () => {
  it('creates the attempt and a row per section, only the first open', async () => {
    const { id: test } = await savePaper('2030-02-01')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    const { rows } = await db.query<{ position: number; started: boolean }>(
      `select s.position, (x.started_at is not null) as started from attempt_sections x
       join sections s on s.id = x.section_id where x.attempt_id = $1 order by s.position`, [a])
    expect(rows.map((r) => r.started)).toEqual([true, false, false, false])
  })

  it('allows one counted attempt per person per paper', async () => {
    const { id: test } = await savePaper('2030-02-02')
    await db.query('select start_attempt($1, $2, false)', [test, STUDENT])
    expect(await fails('select start_attempt($1, $2, false)', [test, STUDENT])).toMatch(/ALREADY_TAKEN/)
    expect((await one<{ n: number }>('select count(*)::int as n from attempts where test_id = $1', [test])).n).toBe(1)
  })

  it('returns the running dry run instead of starting a second', async () => {
    const { id: test } = await savePaper('2030-02-03')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, true) as a', [test, OTHER])
    const { b } = await one<{ b: string }>('select start_attempt($1, $2, true) as b', [test, OTHER])
    expect(b).toBe(a)
    await db.query(`update attempts set state = 'SUBMITTED' where id = $1`, [a])
    const { c } = await one<{ c: string }>('select start_attempt($1, $2, true) as c', [test, OTHER])
    expect(c).not.toBe(a)
  })
})

describe('guards on papers students have sat', () => {
  it('refuses to delete it or move it back to draft', async () => {
    const { id: test } = await savePaper('2030-03-01')
    await db.query(`update tests set status = 'SCHEDULED' where id = $1`, [test])
    await db.query('select start_attempt($1, $2, false)', [test, STUDENT])
    expect(await fails('delete from tests where id = $1', [test])).toMatch(/cannot be deleted/)
    expect(await fails(`update tests set status = 'DRAFT' where id = $1`, [test])).toMatch(/moved back to draft/)
  })

  it('lets a paper with only dry runs go', async () => {
    const { id: test } = await savePaper('2030-03-02')
    await db.query('select start_attempt($1, $2, true)', [test, OTHER])
    await db.query('delete from tests where id = $1', [test])
  })
})

describe('bump_attempt_counter', () => {
  it('increments in place, only while the attempt runs', async () => {
    const { id: test } = await savePaper('2030-04-01')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    await Promise.all([
      db.query(`select bump_attempt_counter($1, 'tab_switches')`, [a]),
      db.query(`select bump_attempt_counter($1, 'tab_switches')`, [a]),
      db.query(`select bump_attempt_counter($1, 'fullscreen_exits')`, [a]),
    ])
    await db.query(`update attempts set state = 'SUBMITTED' where id = $1`, [a])
    await db.query(`select bump_attempt_counter($1, 'tab_switches')`, [a])
    const r = await one<{ t: number; f: number }>('select tab_switches as t, fullscreen_exits as f from attempts where id = $1', [a])
    expect(r).toEqual({ t: 2, f: 1 })
    expect(await fails(`select bump_attempt_counter($1, 'total_score')`, [a])).toMatch(/Unknown counter/)
  })
})

describe('apply_rescore', () => {
  const rescoreRow = (id: string, moved: boolean) => ({
    id, total_score: 3.75, section_scores: [], attempted: 5, correct: 4, wrong: 1, skipped: 0, not_reached: 50, moved,
  })

  it('writes the key and the scores together, stamping only what moved', async () => {
    const { id: test } = await savePaper('2030-05-01')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    await db.query(`update attempts set state = 'SUBMITTED', total_score = 1 where id = $1`, [a])
    const q = await one<{ id: string }>(
      'select q.id from questions q join sections s on s.id = q.section_id where s.test_id = $1 and q.number = 1', [test])

    const { m } = await one<{ m: number }>('select apply_rescore($1, $2, $3, $4) as m',
      [test, q.id, 'C', JSON.stringify([rescoreRow(a, true)])])
    expect(m).toBe(1)
    expect((await one<{ k: string }>('select correct_option as k from questions where id = $1', [q.id])).k).toBe('C')
    const att = await one<{ s: string; r: string | null }>('select total_score::text as s, rescored_at::text as r from attempts where id = $1', [a])
    expect(att.s).toBe('3.75')
    expect(att.r).not.toBeNull()
  })

  it('refuses, changing nothing, when an attempt finished after the scores were computed', async () => {
    const { id: test } = await savePaper('2030-05-02')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    await db.query(`update attempts set state = 'SUBMITTED' where id = $1`, [a])
    const q = await one<{ id: string; k: string }>(
      'select q.id, q.correct_option as k from questions q join sections s on s.id = q.section_id where s.test_id = $1 and q.number = 1', [test])

    expect(await fails('select apply_rescore($1, $2, $3, $4)', [test, q.id, 'C', '[]'])).toMatch(/RESCORE_STALE/)
    expect((await one<{ k: string }>('select correct_option as k from questions where id = $1', [q.id])).k).toBe(q.k)
  })

  it('refuses a question from another paper', async () => {
    const { id: a } = await savePaper('2030-05-03')
    const { id: b } = await savePaper('2030-05-04')
    const q = await one<{ id: string }>(
      'select q.id from questions q join sections s on s.id = q.section_id where s.test_id = $1 limit 1', [b])
    expect(await fails('select apply_rescore($1, $2, $3, $4)', [a, q.id, 'A', '[]'])).toMatch(/QUESTION_NOT_ON_PAPER/)
  })
})

describe('finish_attempt', () => {
  const score = { total_score: 10, section_scores: [], attempted: 12, correct: 11, wrong: 1, skipped: 0, not_reached: 43, time_spent_sec: 1800 }

  it('records a score computed against the current keys, once', async () => {
    const { id: test } = await savePaper('2030-06-01')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    const { v } = await one<{ v: number }>('select key_version as v from tests where id = $1', [test])
    expect((await one<{ r: string }>(`select finish_attempt($1, 'SUBMITTED', $2, $3) as r`, [a, v, score])).r).toBe('ok')
    expect((await one<{ r: string }>(`select finish_attempt($1, 'SUBMITTED', $2, $3) as r`, [a, v, score])).r).toBe('done')
    const row = await one<{ state: string; s: string }>('select state, total_score::text as s from attempts where id = $1', [a])
    expect(row).toEqual({ state: 'SUBMITTED', s: '10.00' })
  })

  it('refuses a score computed before a key correction landed', async () => {
    const { id: test } = await savePaper('2030-06-02')
    const { a } = await one<{ a: string }>('select start_attempt($1, $2, false) as a', [test, STUDENT])
    const { v } = await one<{ v: number }>('select key_version as v from tests where id = $1', [test])
    const q = await one<{ id: string }>(
      'select q.id from questions q join sections s on s.id = q.section_id where s.test_id = $1 and q.number = 1', [test])
    await db.query('select apply_rescore($1, $2, $3, $4)', [test, q.id, 'C', '[]'])
    expect((await one<{ r: string }>(`select finish_attempt($1, 'SUBMITTED', $2, $3) as r`, [a, v, score])).r).toBe('stale')
    expect((await one<{ r: string }>(`select finish_attempt($1, 'SUBMITTED', $2, $3) as r`, [a, v + 1, score])).r).toBe('ok')
  })
})

describe('revoke_user_sessions', () => {
  it('ends every session but the one kept, for that user only', async () => {
    const keep = '11111111-1111-1111-1111-111111111111'
    await db.exec(`
      insert into auth.sessions (id, user_id) values
        ('${keep}', '${STUDENT}'), (gen_random_uuid(), '${STUDENT}'), (gen_random_uuid(), '${OTHER}');
    `)
    const { n } = await one<{ n: number }>('select revoke_user_sessions($1, $2) as n', [STUDENT, keep])
    expect(n).toBe(1)
    const { rows } = await db.query<{ id: string; user_id: string }>('select id, user_id from auth.sessions order by user_id')
    expect(rows.filter((r) => r.user_id === STUDENT).map((r) => r.id)).toEqual([keep])
    expect(rows.filter((r) => r.user_id === OTHER)).toHaveLength(1)

    await db.query('select revoke_user_sessions($1)', [STUDENT])
    expect((await one<{ n: number }>('select count(*)::int as n from auth.sessions where user_id = $1', [STUDENT])).n).toBe(0)
  })
})

describe('rate limits', () => {
  it('allows up to the limit, then says how long to wait, and clears on request', async () => {
    const key = 'login:user:student1'
    for (let i = 0; i < 5; i++) {
      expect((await one<{ w: number }>('select rate_limit_hit($1, 5, 900) as w', [key])).w).toBe(0)
    }
    expect((await one<{ w: number }>('select rate_limit_wait($1, 5) as w', [key])).w).toBeGreaterThan(800)
    expect((await one<{ w: number }>('select rate_limit_hit($1, 5, 900) as w', [key])).w).toBeGreaterThan(800)
    await db.query('select rate_limit_clear($1)', [key])
    expect((await one<{ w: number }>('select rate_limit_wait($1, 5) as w', [key])).w).toBe(0)
  })

  it('starts a fresh window once the old one has passed', async () => {
    const key = 'upload:admin'
    await db.query(`insert into rate_limits values ($1, 99, now() - interval '1 second')`, [key])
    expect((await one<{ w: number }>('select rate_limit_wait($1, 5) as w', [key])).w).toBe(0)
    expect((await one<{ w: number }>('select rate_limit_hit($1, 5, 60) as w', [key])).w).toBe(0)
    expect((await one<{ h: number }>('select hits as h from rate_limits where key = $1', [key])).h).toBe(1)
  })
})

describe('the configurable window', () => {
  const setWindow = (oh: number, om: number, ch: number, cm: number) =>
    db.query(
      `update app_settings set open_hour=$1, open_minute=$2,
       entry_close_hour=$3, entry_close_minute=$4 where id`,
      [oh, om, ch, cm],
    )

  it('starts at the documented defaults, as exactly one row', async () => {
    const row = await one<{ n: string; oh: number; om: number; ch: number; cm: number }>(
      `select count(*)::text n, max(open_hour) oh, max(open_minute) om,
              max(entry_close_hour) ch, max(entry_close_minute) cm from app_settings`)
    expect(row.n).toBe('1')
    expect([row.oh, row.om, row.ch, row.cm]).toEqual([22, 0, 23, 15])
  })

  it('cannot be given a second row', async () => {
    expect(await fails(`insert into app_settings (id) values (true)`)).toMatch(/duplicate key/i)
    // `id` is boolean and checked true, so there is no other value to use.
    expect(await fails(`insert into app_settings (id) values (false)`)).toBeTruthy()
  })

  it('accepts an earlier slot', async () => {
    await setWindow(6, 0, 7, 30)
    const row = await one<{ oh: number; ch: number }>(`select open_hour oh, entry_close_hour ch from app_settings`)
    expect([row.oh, row.ch]).toEqual([6, 7])
    await setWindow(22, 0, 23, 15)
  })

  it('refuses a close that is not after the open', async () => {
    expect(await fails(`update app_settings set open_hour=23, open_minute=30,
                        entry_close_hour=23, entry_close_minute=15 where id`))
      .toMatch(/window_opens_before_it_closes/)
  })

  it('refuses an entry close that would run an attempt past midnight', async () => {
    // 23:16 + 45 minutes is 00:01 the next day, which would put the attempt on
    // the wrong date for the archive, the board and the nightly job.
    expect(await fails(`update app_settings set entry_close_hour=23, entry_close_minute=16 where id`))
      .toMatch(/window_ends_within_the_day/)
    // 23:15 exactly is the last one that fits.
    expect(await fails(`update app_settings set entry_close_hour=23, entry_close_minute=15 where id`)).toBeNull()
  })

  it('refuses an hour or minute outside the clock', async () => {
    expect(await fails(`update app_settings set open_hour=24 where id`)).toMatch(/open_hour/)
    expect(await fails(`update app_settings set open_minute=60 where id`)).toMatch(/open_minute/)
  })
})
