// The signed-in person's role, site and store, remembered on this device so the
// app can open with no signal (loading the profile needs the network). It only
// decides what the screens SHOW: what a person can actually read or change is
// decided by the database on every request, never by this copy.
const PROFILE_KEY = 'sitetrack-profile';
const LAST_USER_KEY = 'sitetrack-last-user';

export interface CachedProfile {
  id: string;
  role: string | null;
  site_id: string | null;
  store_id: string | null;
  full_name: string | null;
}

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage blocked */ }
};

export function getCachedProfile(): CachedProfile | null {
  try {
    const parsed = JSON.parse(read(PROFILE_KEY) ?? 'null');
    return parsed && typeof parsed.id === 'string' ? (parsed as CachedProfile) : null;
  } catch {
    return null;
  }
}
export const setCachedProfile = (p: CachedProfile | null) => write(PROFILE_KEY, p ? JSON.stringify(p) : null);

export const getLastUser = () => read(LAST_USER_KEY);
export const setLastUser = (id: string | null) => write(LAST_USER_KEY, id);

// Roles that mark attendance in the field: the only ones whose data is kept
// on the phone for offline use. Finance, HR and the rest never are.
export const OFFLINE_ROLES = ['supervisor', 'secretary', 'store_manager'];
export const offlineCacheAllowed = () => OFFLINE_ROLES.includes(getCachedProfile()?.role ?? '');
