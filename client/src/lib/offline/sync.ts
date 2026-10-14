import { supabase } from '../supabase';
import { queryClient } from '../queryClient';
import { errorMessage, isNetworkError, qk } from '../api/util';
import { getQueue, loadQueue, markFailed, removeMark, type QueuedMark } from './queue';

export interface SyncResult {
  /** Marks the server accepted. */
  synced: number;
  /** Marks that were already recorded by someone else, so nothing was needed. */
  alreadyMarked: number;
  /** Marks the server refused outright (they stay in the list so the user can see why). */
  failed: number;
  /** Still waiting, because the connection dropped again. */
  remaining: number;
}

let running: Promise<SyncResult> | undefined;

const toRow = (m: QueuedMark) => ({
  worker_id: m.workerId,
  date: m.date,
  status: m.status,
  marked_by: m.markedBy,
  worker_type: m.workerType,
  offline_marked_at: m.queuedAt,
});

// Sends everything this user marked while offline. Safe to call at any time and
// from anywhere: overlapping calls share one run, and a mark can only ever be
// recorded once because attendance is unique per worker per day and every send
// is an "insert unless it already exists" (a retry after a half-finished sync,
// or a second device, can never double-count).
export function syncQueue(userId: string): Promise<SyncResult> {
  running ??= run(userId).finally(() => { running = undefined; });
  return running;
}

async function run(userId: string): Promise<SyncResult> {
  await loadQueue();
  const result: SyncResult = { synced: 0, alreadyMarked: 0, failed: 0, remaining: 0 };
  // Another person's marks on a shared phone are not ours to send.
  const mine = getQueue().filter((m) => m.markedBy === userId && m.state === 'pending');
  if (mine.length === 0) return result;

  // One request for the lot...
  const { data, error } = await supabase
    .from('attendance')
    .upsert(mine.map(toRow), { onConflict: 'worker_id,date', ignoreDuplicates: true })
    .select('worker_id, date');

  if (!error) {
    const inserted = new Set((data ?? []).map((r: { worker_id: string; date: string }) => `${r.worker_id}|${r.date}`));
    for (const m of mine) {
      await removeMark(m.key);
      if (inserted.has(m.key)) result.synced++;
      else result.alreadyMarked++;
    }
  } else if (isNetworkError(error)) {
    result.remaining = mine.length;
    return result;
  } else {
    // ...but one refused row (say, a day now outside the allowed window, or a
    // closed pay month) would refuse the whole batch, so isolate it row by row.
    for (const m of mine) {
      const { error: rowError } = await supabase.from('attendance').insert(toRow(m));
      if (!rowError) { await removeMark(m.key); result.synced++; continue; }
      if (rowError.code === '23505') { await removeMark(m.key); result.alreadyMarked++; continue; }
      if (isNetworkError(rowError)) { result.remaining = getQueue().filter((q) => q.markedBy === userId && q.state === 'pending').length; break; }
      await markFailed(m.key, errorMessage(rowError));
      result.failed++;
    }
  }

  if (result.synced + result.alreadyMarked > 0) {
    queryClient.invalidateQueries({ queryKey: qk.attendance });
  }
  result.remaining ||= getQueue().filter((q) => q.markedBy === userId && q.state === 'pending').length;
  return result;
}
