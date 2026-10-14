// Shared plumbing for the in-memory demo backend: who is signed in, a bus that
// tells realtime subscribers a table changed, and the error type the handlers throw.
export const SESSION_KEY = 'sitetrack-demo-user';
export const AAL_KEY = 'sitetrack-demo-aal';
export const MFA_KEY = 'sitetrack-demo-mfa';
export const DEMO_TOTP_CODE = '123456';

export class DemoError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

const safeGet = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key: string, value: string | null) => {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
};

export const currentUserId = () => safeGet(SESSION_KEY);
export const currentAal = (): 'aal1' | 'aal2' => (safeGet(AAL_KEY) === 'aal2' ? 'aal2' : 'aal1');
export const setSession = (id: string | null) => safeSet(SESSION_KEY, id);
export const setAal = (aal: 'aal1' | 'aal2' | null) => safeSet(AAL_KEY, aal);

export interface MfaState { factorId: string; verified: boolean }
export const getMfa = (userId: string): MfaState | null => {
  try { return JSON.parse(safeGet(`${MFA_KEY}:${userId}`) ?? 'null'); } catch { return null; }
};
export const setMfa = (userId: string, state: MfaState | null) => safeSet(`${MFA_KEY}:${userId}`, state ? JSON.stringify(state) : null);

// ---- change bus (what Supabase Realtime would deliver)
type Listener = (table: string) => void;
const listeners = new Set<Listener>();
export const onChange = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const emitChange = (table: string) => listeners.forEach((l) => l(table));
