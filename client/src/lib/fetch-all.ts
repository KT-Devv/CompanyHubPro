const PAGE_SIZE = 1000;

// PostgREST caps every response (1000 rows by default on Supabase), so a plain
// select() on a big table silently returns a truncated list. That is how a
// month of attendance can quietly under-count days worked. This pages through
// the result with .range() until a short page comes back.
//
// `build` must return a fresh query on every call, and that query must have a
// unique, stable ORDER BY, otherwise rows can repeat or go missing across pages.
export async function fetchAllRows<T = any>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
