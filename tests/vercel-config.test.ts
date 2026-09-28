import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  regions?: string[]
  crons?: { path: string; schedule: string }[]
}

/**
 * vercel.json is read by Vercel and by nobody else, so nothing in a build or a
 * test run would notice if it drifted. These are the two things in it that
 * have visible consequences.
 */
describe('where the functions run', () => {
  /**
   * The Supabase project is in ap-south-1 (Mumbai). Vercel Functions default
   * to iad1 (Washington DC) for every new project, and a dashboard render
   * makes several Supabase calls one after another -- so on the default the
   * page pays the Virginia-to-Mumbai round trip once per call, and the app is
   * inexplicably slower deployed than it is on a laptop in India.
   *
   * bom1 is Vercel's Mumbai region: the same place as the database.
   */
  it('pins them to the region the database is in', () => {
    expect(config.regions, 'vercel.json has no regions, so functions default to iad1').toBeDefined()
    expect(config.regions).toEqual(['bom1'])
  })
})

describe('the nightly sweep', () => {
  it('is registered twice, at 1 PM and 1 AM IST', () => {
    const crons = config.crons ?? []
    expect(crons.map((c) => c.path)).toEqual(['/api/cron/finalise', '/api/cron/finalise'])
    // Vercel Cron runs on UTC. 07:30 and 19:30 UTC are 13:00 and 01:00 IST.
    expect(crons.map((c) => c.schedule).sort()).toEqual(['30 19 * * *', '30 7 * * *'])
  })
})
