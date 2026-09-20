// Cache keys. Every list of a resource shares one prefix, so
// invalidateQueries({ queryKey: qk.workers }) refreshes all of its variants.
export const qk = {
  sites: ['sites'] as const,
  portfolios: ['portfolios'] as const,
  positions: ['positions'] as const,
  stores: ['stores'] as const,
  users: ['users'] as const,
  workers: ['workers'] as const,
  transfers: ['transfers'] as const,
  attendance: ['attendance'] as const,
  finance: ['finance'] as const,
  inventory: ['inventory'] as const,
  goodsLogs: ['goods-logs'] as const,
};

// Turn a Supabase / Postgres error into something a person can act on.
export function errorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  switch (e?.code) {
    case '42501':
      return "You don't have permission to do that.";
    case '23505':
      return 'That record already exists.';
    case '23503':
      return "This record is still referenced elsewhere (for example a worker with attendance or pay records), so it can't be removed.";
    case '23514':
      return 'One of the values is not allowed.';
    case '22P02':
      return 'One of the values is not in the right format.';
  }
  if (e?.message?.toLowerCase().includes('row-level security')) return "You don't have permission to do that.";
  if (e?.message?.toLowerCase().includes('failed to fetch')) return "Can't reach the server. Check your connection and try again.";
  return e?.message || 'Something went wrong. Please try again.';
}
