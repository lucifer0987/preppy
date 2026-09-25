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
/**
 * Stops a caller whose query does not honour the range from spinning forever.
 * At the default cap this is a million rows, which this product cannot reach
 * in any realistic lifetime, so hitting it means the loop is not terminating
 * rather than that the data grew.
 */
const MAX_PAGES = 1000

export async function selectAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0, pages = 0; ; pages++) {
    if (pages >= MAX_PAGES) {
      // Hanging a request until the host kills it gives nobody anything to act
      // on; failing loudly names the query that is misbehaving.
      throw new Error(
        `Could not load ${what}: stopped after ${MAX_PAGES} pages and ${out.length} rows. ` +
        `The query is most likely missing its .range(from, to).`,
      )
    }
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(`Could not load ${what}: ${error.message}`)
    if (!data?.length) return out
    out.push(...data)
    from += data.length
  }
}
