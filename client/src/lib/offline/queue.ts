import { createStore, del, entries, set, type UseStore } from 'idb-keyval';
import type { AttendanceStatus, WorkerType } from '../types';

// Attendance marked with no signal is kept on the phone, in IndexedDB (it
// survives closing the app and restarting the phone), until it can be sent.
// If IndexedDB isn't available (some private modes) it falls back to memory,
// which still covers a drop in signal while the app stays open.

export interface QueuedMark {
  /** worker + date: marking someone twice for a day just replaces the entry. */
  key: string;
  workerId: string;
  workerName: string | null;
  workerType: WorkerType;
  date: string;
  status: AttendanceStatus;
  markedBy: string;
  /** When the supervisor actually tapped; sent as offline_marked_at. */
  queuedAt: string;
  state: 'pending' | 'failed';
  attempts: number;
  error?: string;
}

let store: UseStore | undefined;
try {
  if (typeof indexedDB !== 'undefined') store = createStore('sitetrack-offline', 'marks');
} catch {
  store = undefined;
}

const memory = new Map<string, QueuedMark>();
let snapshot: QueuedMark[] = [];
const listeners = new Set<() => void>();
let loaded: Promise<void> | undefined;

const keyOf = (workerId: string, date: string) => `${workerId}|${date}`;
const emit = () => listeners.forEach((l) => l());
const sorted = (rows: QueuedMark[]) => [...rows].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.key.localeCompare(b.key));

async function writeThrough(mark: QueuedMark) {
  memory.set(mark.key, mark);
  if (store) await set(mark.key, mark, store).catch(() => undefined);
}

function publish() {
  snapshot = sorted(Array.from(memory.values()));
  emit();
}

// Read what an earlier session left behind. Safe to call often.
export function loadQueue(): Promise<void> {
  loaded ??= (async () => {
    if (store) {
      try {
        for (const [, value] of await entries<string, QueuedMark>(store)) memory.set(value.key, value);
      } catch {
        /* unreadable storage: carry on with memory only */
      }
    }
    publish();
  })();
  return loaded;
}

export const getQueue = (): QueuedMark[] => snapshot;

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  void loadQueue();
  return () => { listeners.delete(listener); };
}

export async function enqueueMark(m: Omit<QueuedMark, 'key' | 'queuedAt' | 'state' | 'attempts'>): Promise<QueuedMark> {
  await loadQueue();
  const mark: QueuedMark = { ...m, key: keyOf(m.workerId, m.date), queuedAt: new Date().toISOString(), state: 'pending', attempts: 0 };
  await writeThrough(mark);
  publish();
  return mark;
}

export async function removeMark(key: string): Promise<void> {
  memory.delete(key);
  if (store) await del(key, store).catch(() => undefined);
  publish();
}

export async function markFailed(key: string, error: string): Promise<void> {
  const current = memory.get(key);
  if (!current) return;
  await writeThrough({ ...current, state: 'failed', attempts: current.attempts + 1, error });
  publish();
}

export async function retryMark(key: string): Promise<void> {
  const current = memory.get(key);
  if (!current) return;
  await writeThrough({ ...current, state: 'pending', error: undefined });
  publish();
}

// Test hook: forget everything, in memory and on disk.
export async function clearQueueForTests(): Promise<void> {
  const keys = Array.from(memory.keys());
  memory.clear();
  if (store) await Promise.all(keys.map((k) => del(k, store!).catch(() => undefined)));
  publish();
}
