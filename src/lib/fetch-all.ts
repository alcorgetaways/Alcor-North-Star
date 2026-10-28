/** Pages through a query in batches so totals are never silently capped. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batch = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += batch) {
    const { data, error } = await page(from, from + batch - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < batch) return out;
  }
}
