import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from '@/hooks/use-toast';
import { getQueue, subscribeQueue, type QueuedMark } from './queue';
import { syncQueue } from './sync';

const emptyQueue: QueuedMark[] = [];

// The marks waiting on this phone (everyone's; filter by markedBy where it matters).
export function useOfflineQueue(): QueuedMark[] {
  return useSyncExternalStore(subscribeQueue, getQueue, () => emptyQueue);
}

// Whether the browser believes it has a connection. (It can be wrong in both
// directions, so actions also react to real request failures, not just this.)
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Mounted once for a signed-in user: sends any saved marks whenever the
// connection comes back, on start, and on a slow timer while anything is waiting.
export function useOfflineSync(userId: string | null) {
  const online = useOnline();
  const queue = useOfflineQueue();
  const [syncing, setSyncing] = useState(false);
  const waiting = userId ? queue.filter((m) => m.markedBy === userId && m.state === 'pending').length : 0;
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;

  async function sync() {
    if (!userId || syncing || !navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await syncQueue(userId);
      if (r.synced > 0) toast({ title: 'Attendance synced', description: `${plural(r.synced, 'mark')} saved.${r.alreadyMarked ? ` ${plural(r.alreadyMarked, 'worker')} had already been marked by someone else.` : ''}` });
      else if (r.alreadyMarked > 0) toast({ title: 'Already recorded', description: `${plural(r.alreadyMarked, 'worker')} had already been marked by someone else, so nothing was added.` });
      if (r.failed > 0) toast({ title: 'Some marks were refused', description: `${plural(r.failed, 'mark')} couldn't be saved. Open Mark attendance to see why.`, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (online && waiting > 0) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, userId, waiting > 0]);

  // If the browser says "online" but a request still failed, try again in a while.
  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => { if (waitingRef.current > 0) void sync(); }, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { online, waiting, syncing, syncNow: sync };
}
