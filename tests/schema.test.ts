import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { paperToRows, savePaperPayload } from '../lib/paper-rows'
import { readPaper } from '../lib/paper'

/**
 * The migrations run on a real Postgres (PGlite, in process), so the
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

/**
 * A student may only have one counted attempt in progress at a time
 * (attempts_one_live_per_user), so a case that leaves one open would break the
 * next. Closing them is cheaper than a distinct user per test.
 */
const closeOpenAttempts = () =>
  db.query(`update attempts set state = 'SUBMITTED', submitted_at = now() where state = 'IN_PROGRESS'`)
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
  TRACK = (await one<{ id: string }>(`select id from tracks where slug = 'ibps-so-it'`)).id
}, 60_000)

/** The track everything already in the database belongs to, from 0006. */
let TRACK = ''

const savePaper = async (date: string, title?: string, trackId?: string) => {
  const payload = JSON.stringify({
    ...savePaperPayload(paperToRows({ ...sample, date, ...(title ? { title } : {}) })),
    track_id: trackId ?? TRACK,
  })
  return (await one<{ r: { id: string; replaced_id: string | null } }>('select save_paper($1) as r', [payload])).r
}

/** A scheduled paper with its own window, for the multiple-papers-a-day cases. */
const scheduledPaper = async (date: string, opensAtMin: number, entryClosesAtMin: number) => {
  // A distinct title per paper: two papers on one day are two papers, not a
  // re-upload of the same one.
  const { id } = await savePaper(date, `Paper at ${opensAtMin}`)
  await db.query(
    `update tests set status = 'SCHEDULED', opens_at_min = $2, entry_closes_at_min = $3 where id = $1`,
    [id, opensAtMin, entryClosesAtMin],
  )
  return id
}

// One counted attempt may be open per student at a time, so a case that leaves
// one behind would break the next.
beforeEach(async () => { if (db) await closeOpenAttempts() })

describe('the migrations', () => {
  it('applies twice without error, so it can be re-run safely', async () => {
    await db.exec(schema)
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
    const payload = JSON.stringify({
      ...savePaperPayload(paperToRows({ ...sample, date: '2030-01-03' })), track_id: TRACK,
    })
    expect(await fails('select save_paper($1)', [payload])).toMatch(/DATE_SCHEDULED/)
    expect((await one<{ id: string }>(`select id from tests where date = '2030-01-03'`)).id).toBe(id)
  })

  it('refuses to replace a draft students have sat', async () => {
    const { id } = await savePaper('2030-01-04')
    await db.query('select start_attempt($1, $2, false)', [id, STUDENT])
    const payload = JSON.stringify({
      ...savePaperPayload(paperToRows({ ...sample, date: '2030-01-04' })), track_id: TRACK,
    })
    expect(await fails('select save_paper($1)', [payload])).toMatch(/DRAFT_HAS_ATTEMPTS/)
  })
})

describe('the security model holds for every table, not just the ones we remember', () => {
  it('has row-level security on every table the app owns', async () => {
    // The deny-all is what makes a leaked anon key useless. A table added later
    // without it would be readable by anyone holding that key, and nothing else
    // in the codebase would notice.
    const { rows } = await db.query<{ tablename: string }>(
      `select c.relname tablename from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          and c.relname <> 'schema_migrations'`)
    expect(rows.map((r) => r.tablename)).toEqual([])
  })

  it('grants no policy to anyone, so RLS denies rather than allows', async () => {
    // RLS with a permissive policy is not deny-all. There should be none at all.
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text n from pg_policies where schemaname = 'public'`)
    expect(rows[0]!.n).toBe('0')
  })

  it('leaves no function in public executable by anon or authenticated', async () => {
    // Replaces a test that listed eight function names: the revoke block in
    // 0001 names its functions one by one, so anything a later migration adds
    // is granted to public by default and a fixed list never notices. That list
    // had already fallen behind -- it did not include finish_attempt.
    const { rows } = await db.query<{ fn: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prorettype <> 'trigger'::regtype
          and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))`)
    expect(rows.map((r) => r.fn)).toEqual([])
  })
})

describe("a paper's own length", () => {
  it('is the sum of its sections, kept by trigger', async () => {
    const { id } = await savePaper('2027-02-01')
    // The sample paper is the default pattern: 12 + 12 + 9 + 12 minutes.
    const row = await one<{ n: number }>('select attempt_sec n from tests where id = $1', [id])
    expect(row.n).toBe(45 * 60)
  })

  it('follows a section whose duration changes', async () => {
    const { id } = await savePaper('2027-02-02')
    await db.query(
      `update sections set duration_sec = duration_sec + 300 where test_id = $1 and code = 'ENGLISH'`, [id])
    expect((await one<{ n: number }>('select attempt_sec n from tests where id=$1', [id])).n).toBe(50 * 60)
  })

  it('follows a section being removed', async () => {
    const { id } = await savePaper('2027-02-03')
    await db.query(`delete from sections where test_id = $1 and code = 'ENGLISH'`, [id])
    expect((await one<{ n: number }>('select attempt_sec n from tests where id=$1', [id])).n).toBe(36 * 60)
  })

  it('decides the hard stop, so a longer paper needs an earlier entry close', async () => {
    const { id } = await savePaper('2027-02-04', 'Long one')
    // 90 minutes. Entry closing at 23:15 would run it to 00:45 the next day.
    await db.query(`update sections set duration_sec = 30 * 60 where test_id = $1`, [id])
    expect((await one<{ n: number }>('select attempt_sec n from tests where id=$1', [id])).n).toBe(120 * 60)

    expect(await fails(
      `update tests set status='SCHEDULED', opens_at_min=1320, entry_closes_at_min=1395 where id=$1`, [id]))
      .toMatch(/tests_window_within_the_day/)

    // 22:00 entry close leaves exactly the two hours it needs.
    expect(await fails(
      `update tests set status='SCHEDULED', opens_at_min=1200, entry_closes_at_min=1320 where id=$1`, [id]))
      .toBeNull()
  })

  it('lets a draft be any length, whatever window it happens to carry', async () => {
    // The default window fits 45 minutes. A 2-hour draft must still upload.
    const { id } = await savePaper('2027-02-05', 'Draft long one')
    expect(await fails(`update sections set duration_sec = 30 * 60 where test_id = $1`, [id])).toBeNull()
    const row = await one<{ s: string; n: number }>('select status s, attempt_sec n from tests where id=$1', [id])
    expect([row.s, row.n]).toEqual(['DRAFT', 120 * 60])
  })
})

describe("a paper's own size", () => {
  // The bound used to be 55, the IBPS SO (IT) pattern written into the schema.
  // Counts became configurable in two places afterwards -- the Paper pattern
  // screen and a paper's own questionCount, both capped at 200 a section --
  // and neither was reconciled with it. A 60-question paper passed every check
  // the admin could see and then failed on insert with a raw constraint
  // violation. These pin the two halves together: whatever the form accepts,
  // the table has to take.
  const addQuestion = async (testId: string, number: number) => {
    const { sid } = await one<{ sid: string }>(
      `select id sid from sections where test_id = $1 and code = 'PK'`, [testId])
    return fails(
      `insert into questions (section_id, number, text, options, correct_option)
       values ($1, $2, 'A question long enough to be real.', '{"A":"x","B":"y"}'::jsonb, 'A')`,
      [sid, number])
  }

  it('takes a question numbered past the 55 of any one exam pattern', async () => {
    const { id } = await savePaper('2027-03-01', 'A long one')
    expect(await addQuestion(id, 56)).toBeNull()
    expect(await addQuestion(id, 800)).toBeNull()
  })

  it('still refuses a number outside the bound, in either direction', async () => {
    const { id } = await savePaper('2027-03-02', 'Out of bounds')
    expect(await addQuestion(id, 0)).toMatch(/questions_number_check/)
    expect(await addQuestion(id, 801)).toMatch(/questions_number_check/)
  })

  it('accepts four sections at the pattern form’s own maximum', async () => {
    // 200 a section is what app/admin/pattern/PatternForm.tsx allows, so four
    // of them is the largest paper the console can describe. The ceiling is
    // that number, and this is what says so.
    const { id } = await savePaper('2027-03-03', 'The largest describable paper')
    expect(await addQuestion(id, 4 * 200)).toBeNull()
  })
})

describe("keeping a paper's length in step", () => {
  it('survives the paper being deleted, sections and all', async () => {
    // The sections cascade, so the trigger fires once per section while the
    // tests row it wants to update is already on its way out.
    const { id } = await savePaper('2027-03-01', 'To delete')
    expect(await fails('delete from tests where id = $1', [id])).toBeNull()
    expect((await one<{ n: string }>('select count(*)::text n from tests where id=$1', [id])).n).toBe('0')
  })

  it('handles a section moving to another paper', async () => {
    const a = await savePaper('2027-03-02', 'Paper A')
    const b = await savePaper('2027-03-03', 'Paper B')
    // One section per code per paper, so B has to give up its own English
    // section before it can take A's.
    await db.query(`delete from sections where test_id = $1 and code = 'ENGLISH'`, [b.id])
    await db.query(`update sections set test_id = $2 where test_id = $1 and code = 'ENGLISH'`, [a.id, b.id])
    const rows = await db.query<{ id: string; n: number }>(
      'select id, attempt_sec n from tests where id = any($1)', [[a.id, b.id]])
    const byId = new Map(rows.rows.map((r) => [r.id, r.n]))
    // A lost nine minutes and B is whole again. Both rows have to follow, and
    // before 0006 only the paper the section moved *to* did.
    expect(byId.get(a.id)).toBe(36 * 60)
    expect(byId.get(b.id)).toBe(45 * 60)
  })

  it('falls back to the shipped length for a paper with no sections at all', async () => {
    const { id } = await savePaper('2027-03-04', 'No sections')
    await db.query('delete from sections where test_id = $1', [id])
    expect((await one<{ n: number }>('select attempt_sec n from tests where id=$1', [id])).n).toBe(45 * 60)
  })
})

describe('a window has to be a time of day', () => {
  it('refuses minutes outside the clock, on a draft as well as a scheduled paper', async () => {
    // A draft is exempt from "must fit inside its day" -- it has no night yet --
    // but not from being a time at all. Collapsing the migrations showed the
    // schema had lost this when the day-fit rule was rewritten: 9999 was taken.
    const { id } = await savePaper('2027-04-01', 'Window range')
    for (const bad of [9999, -100, 1440]) {
      expect(await fails('update tests set opens_at_min = $2 where id = $1', [id, bad]), String(bad))
        .toMatch(/tests_window_is_a_time_of_day/)
      expect(await fails('update tests set entry_closes_at_min = $2 where id = $1', [id, bad]), String(bad))
        .toMatch(/tests_window_is_a_time_of_day/)
    }
    expect(await fails('update tests set opens_at_min = 0 where id = $1', [id])).toBeNull()
    expect(await fails('update tests set entry_closes_at_min = 1439 where id = $1', [id])).toBeNull()
  })
})

describe("a track's pattern", () => {
  it('starts as the pattern the product shipped with', async () => {
    const { rows } = await db.query<{ code: string; q: number; d: number; c: string; n: string }>(
      `select code, question_count q, duration_sec d, marks_correct::text c, marks_negative::text n
         from track_sections where track_id = $1 order by position`, [TRACK])
    expect(rows.map((r) => [r.code, r.q, r.d / 60])).toEqual([
      ['QUANT', 15, 12], ['REASONING', 15, 12], ['ENGLISH', 10, 9], ['PK', 15, 12],
    ])
    expect(rows.every((r) => Number(r.c) === 1 && Number(r.n) === 0.25)).toBe(true)
    expect(rows.reduce((a, r) => a + r.q, 0)).toBe(55)
    expect(rows.reduce((a, r) => a + r.d, 0)).toBe(45 * 60)
  })

  it('can be changed, and refuses nonsense', async () => {
    const set = (what: string) =>
      fails(`update track_sections set ${what} where code = 'ENGLISH' and track_id = $1`, [TRACK])
    expect(await set('question_count = 20, duration_sec = 15 * 60')).toBeNull()
    expect(await set('question_count = 0')).toMatch(/question_count/)
    expect(await set('marks_correct = 0')).toMatch(/marks_correct/)
    expect(await set('marks_negative = -1')).toMatch(/marks_negative/)
    expect(await set('duration_sec = 30')).toMatch(/duration_sec/)
    await set('question_count = 10, duration_sec = 9 * 60')
  })

  it('carries the label its track gives a section', async () => {
    const { rows } = await db.query<{ label: string | null }>(
      `select label from track_sections where track_id = $1 and code = 'PK'`, [TRACK])
    // The name that used to be compiled into lib/types.ts, now said out loud
    // so another discipline can say something else.
    expect(rows[0]!.label).toBe('Professional Knowledge (CSE)')
  })

  it('is per track, so two tracks can hold the same section in slot one', async () => {
    const other = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('sbi-so', 'SBI SO', 90)
       returning id`)).id
    expect(await fails(
      `insert into track_sections (track_id, code, position, question_count, duration_sec,
                                   marks_correct, marks_negative)
       values ($1, 'QUANT', 1, 20, 900, 1, 0.25)`, [other])).toBeNull()
    // ...but not twice within one track.
    expect(await fails(
      `insert into track_sections (track_id, code, position, question_count, duration_sec,
                                   marks_correct, marks_negative)
       values ($1, 'GENERAL_AWARENESS', 1, 20, 900, 1, 0.25)`, [other]))
      .toMatch(/track_sections_one_per_position/)
    await db.query('delete from tracks where id = $1', [other])
  })
})

describe('an exam track', () => {
  it('owns every paper, so a paper cannot exist without one', async () => {
    expect(await fails(
      `insert into tests (date, status) values ('2031-01-01', 'DRAFT')`))
      .toMatch(/track_id/)
  })

  it('lets two tracks open a paper at the same minute on the same day', async () => {
    const other = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('rrb-so', 'IBPS RRB', 91)
       returning id`)).id
    await savePattern(other)
    const mine = await savePaper('2031-02-01', 'Mine')
    const theirs = await savePaper('2031-02-01', 'Theirs', other)
    for (const id of [mine.id, theirs.id]) {
      expect(await fails(
        `update tests set status='SCHEDULED', opens_at_min=600, entry_closes_at_min=660
          where id = $1`, [id])).toBeNull()
    }
    // Within one track it is still refused: two papers opening at the same
    // minute is a choice a student cannot make.
    const clash = await savePaper('2031-02-01', 'Mine again')
    expect(await fails(
      `update tests set status='SCHEDULED', opens_at_min=600, entry_closes_at_min=660
        where id = $1`, [clash.id]))
      .toMatch(/tests_one_scheduled_per_track_date_and_opening/)
    await db.query('delete from tests where id = any($1)', [[mine.id, theirs.id, clash.id]])
    await db.query('delete from tracks where id = $1', [other])
  })

  it('takes its sections with it when it goes', async () => {
    const doomed = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('gone', 'Gone', 92) returning id`)).id
    await savePattern(doomed)
    await db.query('delete from tracks where id = $1', [doomed])
    const left = await one<{ n: number }>(
      'select count(*)::int as n from track_sections where track_id = $1', [doomed])
    expect(left.n).toBe(0)
  })
})

describe('save_track_pattern', () => {
  // The delete and the inserts have to be one transaction. They used to be two
  // PostgREST calls, so a failure between them left a track with no sections
  // -- and a track with no sections reads as the shipped default pattern, so
  // nothing raised and the track had quietly become a different exam.
  const pattern = (trackId: string, sections: Record<string, unknown>[]) =>
    JSON.stringify({ track_id: trackId, sections })

  const shape = (code: string, q = 10) => ({
    code, label: null, question_count: q, duration_sec: 600,
    marks_correct: 1, marks_negative: 0.25,
  })

  it('replaces the whole pattern, numbering the positions in order', async () => {
    const t = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('p-ok', 'Ok', 80) returning id`)).id
    await db.query('select save_track_pattern($1)', [pattern(t, [
      shape('REASONING', 20), shape('GENERAL_AWARENESS', 15), shape('PK', 5),
    ])])
    const { rows } = await db.query<{ code: string; position: number; question_count: number }>(
      'select code, position, question_count from track_sections where track_id = $1 order by position', [t])
    expect(rows.map((r) => [r.code, r.position, r.question_count])).toEqual([
      ['REASONING', 1, 20], ['GENERAL_AWARENESS', 2, 15], ['PK', 3, 5],
    ])
  })

  it('leaves the old pattern untouched when the new one cannot be written', async () => {
    const t = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('p-roll', 'Rollback', 81) returning id`)).id
    await db.query('select save_track_pattern($1)', [pattern(t, [shape('QUANT', 15), shape('ENGLISH', 10)])])

    // question_count 0 fails its check constraint, and it is the second row,
    // so the delete and the first insert have already happened.
    const failed = await fails('select save_track_pattern($1)',
      [pattern(t, [shape('PK', 12), shape('REASONING', 0)])])
    expect(failed).toMatch(/question_count/)

    const { rows } = await db.query<{ code: string }>(
      'select code from track_sections where track_id = $1 order by position', [t])
    expect(rows.map((r) => r.code)).toEqual(['QUANT', 'ENGLISH'])
  })

  it('refuses to leave a track with no sections at all', async () => {
    const t = (await one<{ id: string }>(
      `insert into tracks (slug, name, position) values ('p-empty', 'Empty', 82) returning id`)).id
    await db.query('select save_track_pattern($1)', [pattern(t, [shape('QUANT')])])
    expect(await fails('select save_track_pattern($1)', [pattern(t, [])])).toMatch(/EMPTY_PATTERN/)
    const left = await one<{ n: number }>(
      'select count(*)::int as n from track_sections where track_id = $1', [t])
    expect(left.n).toBe(1)
  })

  it('refuses a track that is not there, rather than writing nothing quietly', async () => {
    expect(await fails('select save_track_pattern($1)',
      [pattern('00000000-0000-0000-0000-0000000000ff', [shape('QUANT')])]))
      .toMatch(/NO_SUCH_TRACK/)
  })
})

/** The shipped pattern, for a track made inside a test. */
const savePattern = (trackId: string) => db.query(
  `insert into track_sections (track_id, code, position, question_count, duration_sec,
                               marks_correct, marks_negative)
   values ($1, 'QUANT', 1, 15, 720, 1, 0.25), ($1, 'REASONING', 2, 15, 720, 1, 0.25),
          ($1, 'ENGLISH', 3, 10, 540, 1, 0.25), ($1, 'PK', 4, 15, 720, 1, 0.25)`, [trackId])

describe('one paper at a time', () => {
  it('refuses a second counted attempt while another is still open', async () => {
    // Two papers can run in one day now, and a student sitting both at once
    // would be splitting 45 minutes across two clocks.
    const morning = await scheduledPaper('2026-11-01', 6 * 60, 7 * 60)
    const evening = await scheduledPaper('2026-11-01', 22 * 60, 23 * 60)
    await db.query('select start_attempt($1, $2, false)', [morning, STUDENT])
    expect(await fails('select start_attempt($1, $2, false)', [evening, STUDENT]))
      .toMatch(/ANOTHER_PAPER_OPEN/)

    // Once the first is finished the second is allowed.
    await closeOpenAttempts()
    expect(await fails('select start_attempt($1, $2, false)', [evening, STUDENT])).toBeNull()
    await closeOpenAttempts()
  })

  it('says ALREADY_TAKEN, not ANOTHER_PAPER_OPEN, for the same paper twice', async () => {
    const paper = await scheduledPaper('2026-11-02', 22 * 60, 23 * 60)
    await db.query('select start_attempt($1, $2, false)', [paper, STUDENT])
    await closeOpenAttempts()
    expect(await fails('select start_attempt($1, $2, false)', [paper, STUDENT])).toMatch(/ALREADY_TAKEN/)
  })

  it('lets a dry run sit alongside a counted attempt', async () => {
    // The admin rehearsing a paper must not be blocked by their own history.
    const paper = await scheduledPaper('2026-11-03', 22 * 60, 23 * 60)
    await db.query('select start_attempt($1, $2, false)', [paper, STUDENT])
    expect(await fails('select start_attempt($1, $2, true)', [paper, OTHER])).toBeNull()
    await closeOpenAttempts()
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

  it('no longer decides on its own whether an attempt fits the day', async () => {
    // It cannot: how long an attempt runs is now the default pattern's total,
    // which lives in track_sections. So 23:16 is accepted here and refused by
    // windowProblem in lib/time.ts, which knows the total. What the row can
    // still say is that an entry close must be a time of day at all.
    expect(await fails(`update app_settings set entry_close_hour=23, entry_close_minute=16 where id`)).toBeNull()
    expect(await fails(`update app_settings set entry_close_hour=23, entry_close_minute=15 where id`)).toBeNull()
  })

  it('refuses an hour or minute outside the clock', async () => {
    expect(await fails(`update app_settings set open_hour=24 where id`)).toMatch(/open_hour/)
    expect(await fails(`update app_settings set open_minute=60 where id`)).toMatch(/open_minute/)
  })
})

describe('more than one paper a day', () => {
  it('accepts two drafts for the same day', async () => {
    // Both drafts carry the column default until they are scheduled, so a
    // unique index over every row would refuse the second one and the whole
    // feature would stop at the upload.
    await savePaper('2026-12-01', 'Morning set')
    const second = await savePaper('2026-12-01', 'Evening set')
    expect(second.id).toBeTruthy()
    expect(second.replaced_id).toBeNull()
  })

  it('still replaces a re-upload of the same draft', async () => {
    const again = await savePaper('2026-12-01', 'Evening set')
    expect(again.replaced_id).toBeTruthy()
  })

  it('schedules both, at windows that do not overlap', async () => {
    const morning = await scheduledPaper('2026-12-02', 6 * 60, 7 * 60)
    const evening = await scheduledPaper('2026-12-02', 22 * 60, 23 * 60)
    expect(morning).not.toBe(evening)
    const { n } = await one<{ n: string }>(
      `select count(*)::text n from tests where date = '2026-12-02' and status = 'SCHEDULED'`)
    expect(n).toBe('2')
  })

  it('refuses two scheduled papers opening at the same minute', async () => {
    await scheduledPaper('2026-12-03', 22 * 60, 23 * 60)
    const { id } = await savePaper('2026-12-03', 'A clash')
    expect(await fails(
      `update tests set status = 'SCHEDULED', opens_at_min = $2, entry_closes_at_min = $3 where id = $1`,
      [id, 22 * 60, 23 * 60],
    )).toMatch(/tests_one_scheduled_per_track_date_and_opening/)
  })
})
