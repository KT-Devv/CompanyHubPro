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
  payroll: ['payroll'] as const,
  audit: ['audit'] as const,
  settings: ['settings'] as const,
  invoices: ['invoices'] as const,
  insights: ['insights'] as const,
};

// True when a request failed because there was no connection (as opposed to the
// server refusing it). Offline-capable actions queue on this instead of failing.
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = String((error as { message?: string } | null)?.message ?? error ?? '');
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}

// Turn a Supabase / Postgres error into something a person can act on.
// The database's own functions (rpc_*) raise specific, readable messages ("Only
// the CEO can reopen a closed month"); those are kept. Only the bare, technical
// ones (a row-level-security refusal, a duplicate-key error) are reworded.
export function errorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message ?? '';
  const technical = /row-level security|permission denied|duplicate key|violates .* constraint|invalid input syntax/i.test(message);
  const specific = !!message && !technical;

  switch (e?.code) {
    case '42501':
      return specific ? message : "You don't have permission to do that.";
    case '23505':
      return specific ? message : 'That record already exists.';
    case '23503':
      return "This record is still referenced elsewhere (for example a worker with attendance or pay records), so it can't be removed.";
    case '23514':
      return specific ? message : 'One of the values is not allowed.';
    case '22P02':
      return 'One of the values is not in the right format.';
  }
  if (/row-level security/i.test(message)) return "You don't have permission to do that.";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "Can't reach the server. Check your connection and try again.";
  return message || 'Something went wrong. Please try again.';
}
