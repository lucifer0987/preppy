import { describe, expect, it, vi } from 'vitest'

/**
 * A paper belongs to one exam, and so does a student (PRD 6.10.1).
 *
 * The lists already only show a student their own exam's papers, but a list is
 * not a security boundary: every paper is one URL away, and four routes take a
 * paper id straight out of that URL -- the briefing, the action behind it, the
 * archive page and the image route. Each of them used to load the paper and
 * never ask whose exam it was, so a student on one track could sit, read and
 * pull images from another track's paper by guessing nothing more than an id.
 */

vi.mock('server-only', () => ({}))

const TRACKS = [
  { id: 'it', slug: 'ibps-so-it', name: 'IBPS SO (IT)', position: 1, is_active: true },
  { id: 'agri', slug: 'ibps-so-agri', name: 'IBPS SO (Agriculture)', position: 2, is_active: true },
]

vi.mock('../lib/env', () => ({ isConfigured: () => true }))
vi.mock('../lib/supabase/admin', () => ({
  db: () => ({
    from: () => ({
      select: () => ({ order: () => ({ data: TRACKS, error: null }) }),
    }),
  }),
}))

const { paperOnViewersTrack } = await import('../lib/repo/tracks')

const student = (trackId: string | null) => ({ role: 'student', trackId })
const admin = { role: 'admin', trackId: null }

describe('who may be shown a paper', () => {
  it('shows a student their own exam’s paper', async () => {
    expect(await paperOnViewersTrack(student('it'), 'it')).toBe(true)
  })

  it('refuses another exam’s paper, however they got the id', async () => {
    expect(await paperOnViewersTrack(student('it'), 'agri')).toBe(false)
    expect(await paperOnViewersTrack(student('agri'), 'it')).toBe(false)
  })

  it('shows an admin every exam, because they run all of them', async () => {
    expect(await paperOnViewersTrack(admin, 'it')).toBe(true)
    expect(await paperOnViewersTrack(admin, 'agri')).toBe(true)
  })

  it('refuses a paper with no exam rather than letting it through', async () => {
    // Not reachable through the app -- tests.track_id is not null -- but a
    // guard that fails open on missing data is the wrong kind of guard.
    expect(await paperOnViewersTrack(student('it'), null)).toBe(false)
    expect(await paperOnViewersTrack(admin, null)).toBe(true)
  })

  it('falls back for a student whose exam is unset, rather than refusing everything', async () => {
    // viewerTrack sends them to the first active track, so they see that one's
    // papers and no others. An empty product with no explanation would be worse.
    expect(await paperOnViewersTrack(student(null), 'it')).toBe(true)
    expect(await paperOnViewersTrack(student(null), 'agri')).toBe(false)
  })
})
