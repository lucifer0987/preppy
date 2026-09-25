import 'server-only'

/**
 * Reads every page of a query. PostgREST caps a response (1,000 rows by
 * default), and a capped response looks exactly like a complete one, so a
 * board read in one request silently loses attempts once the history grows.
 *
 * Advances by what actually came back rather than by a fixed page size, so a
 * server configured with a lower cap still reads everything. The query must
 * have a stable order for the pages not to overlap.
 */
export async function selectAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ;) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(`Could not load ${what}: ${error.message}`)
    if (!data?.length) return out
    out.push(...data)
    from += data.length
  }
}
