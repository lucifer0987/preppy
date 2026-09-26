import { beforeEach, describe, expect, it, vi } from 'vitest'

// server-only throws outside a server component; the rest is stubbed so the
// branch under test -- what startAttempt does when the database refuses -- runs
// without a database behind it.
vi.mock('server-only', () => ({}))

const rpc = vi.fn()
vi.mock('../lib/supabase/admin', () => ({ db: () => ({ rpc }) }))

const finaliseOverdueForUser = vi.fn()
vi.mock('../lib/repo/finalise', () => ({ finaliseOverdueForUser }))

const { startAttempt } = await import('../lib/repo/attempts')

const PAPER = 'paper-1', STUDENT = 'student-1'
const refuse = (code: string) => ({ data: null, error: { message: `... ${code} ...` } })
const allow = (id: string) => ({ data: id, error: null })
const start = () => startAttempt(PAPER, STUDENT, false)

beforeEach(() => {
  rpc.mockReset()
  finaliseOverdueForUser.mockReset()
  finaliseOverdueForUser.mockResolvedValue({ scanned: 0, finalised: [], failed: [] })
})

describe('starting an attempt when the database says no', () => {
  it('returns the new attempt when nothing is in the way', async () => {
    rpc.mockResolvedValueOnce(allow('attempt-1'))
    expect(await start()).toBe('attempt-1')
    expect(finaliseOverdueForUser).not.toHaveBeenCalled()
  })

  it('turns ALREADY_TAKEN into something a student can read', async () => {
    rpc.mockResolvedValueOnce(refuse('ALREADY_TAKEN'))
    await expect(start()).rejects.toThrow('You have already taken this paper.')
  })

  it('turns NO_SECTIONS into something a student can read', async () => {
    rpc.mockResolvedValueOnce(refuse('NO_SECTIONS'))
    await expect(start()).rejects.toThrow(/no sections/)
  })

  it('scores the abandoned earlier paper, then starts this one', async () => {
    // The whole point of the sweep: a student who walked away from the morning
    // paper must not be locked out of the evening paper until 03:00 tomorrow.
    rpc.mockResolvedValueOnce(refuse('ANOTHER_PAPER_OPEN')).mockResolvedValueOnce(allow('attempt-2'))
    finaliseOverdueForUser.mockResolvedValue({ scanned: 1, finalised: ['stale'], failed: [] })

    expect(await start()).toBe('attempt-2')
    expect(finaliseOverdueForUser).toHaveBeenCalledWith(STUDENT)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the sweep found nothing overdue', async () => {
    // Then the other paper really is still running, and the student has to
    // finish it. Retrying would just fail the same way.
    rpc.mockResolvedValueOnce(refuse('ANOTHER_PAPER_OPEN'))
    await expect(start()).rejects.toThrow('You still have another paper open. Finish that one before starting this paper.')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('reports the real reason when the retry says the paper was already taken', async () => {
    rpc.mockResolvedValueOnce(refuse('ANOTHER_PAPER_OPEN')).mockResolvedValueOnce(refuse('ALREADY_TAKEN'))
    finaliseOverdueForUser.mockResolvedValue({ scanned: 1, finalised: ['stale'], failed: [] })
    await expect(start()).rejects.toThrow('You have already taken this paper.')
  })

  it('passes any other database error through', async () => {
    rpc.mockResolvedValueOnce(refuse('connection reset'))
    await expect(start()).rejects.toThrow(/Could not start the attempt/)
  })
})
