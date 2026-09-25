import { describe, expect, it, vi } from 'vitest'

// server-only throws outside a server component, and this module is pure.
vi.mock('server-only', () => ({}))
const { selectAll } = await import('../lib/repo/select-all')

const ok = <T,>(data: T[]) => Promise.resolve({ data, error: null })

describe('reading every page', () => {
  it('returns a single short page as-is', async () => {
    const all = [1, 2, 3]
    const rows = await selectAll('things', (from, to) => ok(all.slice(from, to + 1)))
    expect(rows).toEqual([1, 2, 3])
  })

  it('keeps going while pages come back full, and stops on the empty one', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i)
    const seen: [number, number][] = []
    const rows = await selectAll<number>('things', (from, to) => {
      seen.push([from, to])
      return ok(all.slice(from, to + 1))
    })
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toBe(2499)
    // Three full-ish pages plus the empty one that ends it.
    expect(seen).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]])
  })

  it('advances by what came back, not by a fixed page size', async () => {
    // A server capped at 100 rows still gets read completely.
    const all = Array.from({ length: 250 }, (_, i) => i)
    const rows = await selectAll<number>('things', (from) => ok(all.slice(from, from + 100)))
    expect(rows).toHaveLength(250)
  })

  it('returns nothing for an empty table', async () => {
    expect(await selectAll('things', () => ok([]))).toEqual([])
  })

  it('names the query when the database errors', async () => {
    await expect(selectAll('attempts', () => Promise.resolve({ data: null, error: { message: 'boom' } })))
      .rejects.toThrow(/Could not load attempts: boom/)
  })

  it('refuses to spin forever when a query ignores its range', async () => {
    // The failure this guards against: a caller that forgets .range() gets the
    // same full page back every time, so the loop never reaches an empty one.
    const page = vi.fn(() => ok(new Array(1000).fill(0)))
    await expect(selectAll('attempts', page)).rejects.toThrow(/stopped after 1000 pages/)
    await expect(selectAll('attempts', page)).rejects.toThrow(/missing its \.range/)
  })
})
