import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { Query } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { getLastUser, offlineCacheAllowed } from './profile-cache';

// A copy of the few lists a field user needs (their workers, today's marks,
// the sites), kept on the phone so the attendance screen still opens and works
// with no signal. It is stored per user, only for the field roles, and wiped on
// sign-out or when a different person signs in on the same phone.
let store: UseStore | undefined;
try {
  if (typeof indexedDB !== 'undefined') store = createStore('sitetrack-offline', 'query-cache');
} catch {
  store = undefined;
}

const cacheKey = () => {
  const user = getLastUser();
  return user ? `rq:${user}` : null;
};

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
// Bump when the shape of cached data changes, so old caches are dropped, not misread.
export const PERSIST_BUSTER = 'v1';

// Only these, and only once loaded: never the money screens, never other roles.
export function shouldPersistQuery(query: Query): boolean {
  if (!offlineCacheAllowed() || query.state.status !== 'success') return false;
  const [root, second] = query.queryKey as [string, string?];
  return root === 'workers' || root === 'sites' || (root === 'attendance' && second === 'day');
}

export const persister: Persister = {
  async persistClient(client: PersistedClient) {
    const key = cacheKey();
    if (store && key) await set(key, client, store).catch(() => undefined);
  },
  async restoreClient() {
    const key = cacheKey();
    if (!store || !key || !offlineCacheAllowed()) return undefined;
    return (await get<PersistedClient>(key, store).catch(() => undefined)) ?? undefined;
  },
  async removeClient() {
    const key = cacheKey();
    if (store && key) await del(key, store).catch(() => undefined);
  },
};

export async function clearPersistedCache(forUser?: string | null): Promise<void> {
  const user = forUser ?? getLastUser();
  if (store && user) await del(`rq:${user}`, store).catch(() => undefined);
}
