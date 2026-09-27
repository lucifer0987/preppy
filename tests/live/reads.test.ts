import { describe, expect, it, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Every read this app makes against Supabase, run once against the real
 * project.
 *
 * Not a test of what the data says -- the cohort's rows change nightly -- but
 * of whether each query is one PostgREST accepts and whether what comes back
 * is the shape the code then reads. That is the gap nothing else covers:
 * pglite proves the schema, TypeScript proves the types, and neither of them
 * knows that a select forgot a column until a page is opened.
 *
 * Read-only by construction: nothing here writes, so it is safe to point at
 * the live project. Skipped when there are no credentials.
 */
vi.mock('server-only', () => ({}))

// The suite runs outside Next, so .env.local is read the same way the
// migration runner reads it rather than assumed to be in the environment.
function loadEnv() {
  if (process.env['NEXT_PUBLIC_SUPABASE_URL']) return
  let text: string
  try {
    text = readFileSync('.env.local', 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const value = m[2]!.trim().replace(/^["']|["']$/g, '')
    if (value) process.env[m[1]!] ??= value
  }
}
loadEnv()

const configured = Boolean(process.env['NEXT_PUBLIC_SUPABASE_URL'] && process.env['SUPABASE_SECRET_KEY'])

describe.skipIf(!configured)('every read, against the real project', () => {
  let repo: {
    papers: typeof import('../../lib/repo/papers')
    leaderboard: typeof import('../../lib/repo/leaderboard')
    settings: typeof import('../../lib/repo/settings')
    users: typeof import('../../lib/repo/users')
    admin: typeof import('../../lib/repo/attempt-admin')
    rescore: typeof import('../../lib/repo/rescore')
    images: typeof import('../../lib/repo/images')
  }

  beforeAll(async () => {
    repo = {
      papers: await import('../../lib/repo/papers'),
      leaderboard: await import('../../lib/repo/leaderboard'),
      settings: await import('../../lib/repo/settings'),
      users: await import('../../lib/repo/users'),
      admin: await import('../../lib/repo/attempt-admin'),
      rescore: await import('../../lib/repo/rescore'),
      images: await import('../../lib/repo/images'),
    }
  })

  it('reads the settings the whole app reads on every page', async () => {
    await expect(repo.settings.getPattern()).resolves.toHaveLength(4)
    await expect(repo.settings.getWindow()).resolves.toMatchObject({ openHour: expect.any(Number) })
    await expect(repo.settings.getPatternMeta()).resolves.toBeDefined()
    await expect(repo.settings.getWindowMeta()).resolves.toBeDefined()
    await expect(repo.settings.defaultAttemptMinutes()).resolves.toBeGreaterThan(0)
  })

  it('lists papers, and every one of them carries a window', async () => {
    const papers = await repo.papers.listPapers()
    for (const p of papers) {
      expect(p.window.attemptMinutes).toBeGreaterThan(0)
      expect(p.window).toHaveProperty('endedAt')
    }
  })

  it('loads one paper whole, with its lock and its item statistics', async () => {
    const papers = await repo.papers.listPapers()
    if (!papers.length) return
    const id = papers[0]!.id
    const record = await repo.papers.getPaperById(id)
    expect(record?.paper.sections.length).toBeGreaterThan(0)
    const lock = await repo.papers.paperLock(id)
    expect(lock).toMatchObject({ canSchedule: expect.any(Boolean), canEndNow: expect.any(Boolean) })
    await expect(repo.rescore.getItemStats(id)).resolves.toBeInstanceOf(Array)
    await expect(repo.images.listPaperImages(id)).resolves.toBeDefined()
  })

  it('exports the bank, which builds a window for every published paper', async () => {
    // The select behind this forgot its window columns for a while, and
    // paperWindowOf threw on the first row -- so Export bank was a 500 that
    // nothing noticed, because nothing had ever called it.
    const bank = await repo.papers.loadPublishedPapers()
    for (const p of bank) expect(p.window.attemptMinutes).toBeGreaterThan(0)
  })

  it('reads the board, its papers, and one paper\'s standings', async () => {
    const all = await repo.leaderboard.getLeaderboard()
    expect(all.rows).toBeInstanceOf(Array)
    // What a total is out of: the sum of the perfect scores of the papers in
    // the window, so it can never be less than anybody's total on it.
    expect(all.maxMarks).toBeGreaterThanOrEqual(0)
    for (const row of all.rows) expect(row.totalPoints).toBeLessThanOrEqual(all.maxMarks)

    const recent = await repo.leaderboard.getLeaderboard({ lastN: 7 })
    expect(recent.rows).toBeInstanceOf(Array)
    expect(recent.papers).toBeLessThanOrEqual(all.papers)
    const papers = await repo.leaderboard.boardPapers()
    expect(papers).toBeInstanceOf(Array)
    if (papers.length) {
      await expect(repo.leaderboard.getPaperStandings(papers[0]!.id)).resolves.not.toBeNull()
    }
  })

  it('reads the people, and one of their archives', async () => {
    const people = await repo.users.listUsers()
    expect(people.length).toBeGreaterThan(0)
    const student = people.find((p) => p.role === 'student')
    if (student) await expect(repo.leaderboard.getArchive(student.id)).resolves.toBeInstanceOf(Array)
  })

  it('reads the attempts the console lists', async () => {
    await expect(repo.admin.getAttemptsByTest()).resolves.toBeInstanceOf(Array)
    const papers = await repo.papers.listPapers()
    if (papers.length) {
      await expect(repo.admin.countRunningAttempts(papers[0]!.id)).resolves.toBeGreaterThanOrEqual(0)
    }
  })

  it('reads what the home page and the dashboard ask for', async () => {
    const upcoming = await repo.papers.upcomingPapers()
    expect(upcoming).toHaveProperty('live')
    expect(upcoming).toHaveProperty('next')
    await expect(repo.papers.scheduledDates()).resolves.toBeInstanceOf(Array)
  })
})
