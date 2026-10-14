import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { toast } from '@/hooks/use-toast';
import { isNetworkError } from './api/util';
import { setMonitoringUser } from './monitoring';
import { getCachedProfile, getLastUser, setCachedProfile, setLastUser, type CachedProfile } from './offline/profile-cache';
import { clearPersistedCache } from './offline/persist';
import type { User } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

export type AssuranceLevel = 'aal1' | 'aal2' | null;

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  userId: string | null;
  userSiteId: string | null;
  userStoreId: string | null;
  userFullName: string | null;
  loading: boolean;
  /** How strongly this sign-in has been verified: aal2 means the two-step code was entered. */
  aal: AssuranceLevel;
  /** Whether this account has a verified two-step sign-in (authenticator app) set up. */
  hasFactor: boolean;
  /** True when the app is running from this device's saved copy because there is no connection. */
  offlineSession: boolean;
  refreshAssurance: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Forget everything this device holds about the previous person: screens in
// memory, the saved offline copy, and who it belonged to.
async function purgeLocalData(previousUser: string | null) {
  queryClient.clear();
  await clearPersistedCache(previousUser);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSiteId, setUserSiteId] = useState<string | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [aal, setAal] = useState<AssuranceLevel>(null);
  const [hasFactor, setHasFactor] = useState(false);
  const [offlineSession, setOfflineSession] = useState(false);
  const [loading, setLoading] = useState(true);
  // Which auth user the profile state currently belongs to. Supabase re-emits
  // SIGNED_IN on every tab refocus and token refresh; without this we'd reload
  // the profile (and, if we flipped `loading`, blank the page) each time.
  const profileUserId = useRef<string | null>(null);

  const applyProfile = useCallback((p: CachedProfile | null) => {
    setUserRole(p?.role || null);
    setUserId(p?.id || null);
    setUserSiteId(p?.site_id || null);
    setUserStoreId(p?.store_id || null);
    setUserFullName(p?.full_name || null);
    setMonitoringUser(p ? { id: p.id, role: p.role } : null);
  }, []);

  const refreshAssurance = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      setAal((data?.currentLevel as AssuranceLevel) ?? null);
      // nextLevel is aal2 only when a verified factor exists.
      setHasFactor(data?.nextLevel === 'aal2');
    } catch (error) {
      // Offline or unreachable: leave as is. The database enforces the rule either way.
      if (!isNetworkError(error)) console.error('Could not read sign-in assurance level:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function endSession(previousUser: string | null) {
      profileUserId.current = null;
      await purgeLocalData(previousUser);
      setCachedProfile(null);
      setLastUser(null);
    }

    function handleSession(session: Session | null) {
      if (!mounted) return;
      setUser(session?.user ?? null);

      if (!session?.user) {
        const previous = profileUserId.current ?? getLastUser();
        void endSession(previous);
        applyProfile(null);
        setAal(null);
        setHasFactor(false);
        setOfflineSession(false);
        setLoading(false);
        return;
      }

      if (profileUserId.current === session.user.id) return;
      profileUserId.current = session.user.id;

      // A different person on the same phone must never see (or keep) the last
      // person's saved data.
      const last = getLastUser();
      if (last && last !== session.user.id) {
        void purgeLocalData(last);
        setCachedProfile(null);
      }
      setLastUser(session.user.id);

      // Hold the router on its spinner until we know the role, so a fresh
      // sign-in doesn't bounce through /login while the profile loads.
      setLoading(true);
      const authUserId = session.user.id;
      // Deferred: supabase-js can deadlock if the client is called from inside
      // its own auth-state callback.
      setTimeout(() => {
        if (mounted) void loadUserProfile(authUserId);
      }, 0);
    }

    // No way to reach the server, but this device remembers who was signed in:
    // open the app from that copy so the field can keep working. Anything it
    // sends later is checked by the database as normal.
    function resumeOffline(): boolean {
      const cached = getCachedProfile();
      if (!cached) return false;
      profileUserId.current = cached.id;
      setUser({ id: cached.id } as User);
      applyProfile(cached);
      setOfflineSession(true);
      setLoading(false);
      return true;
    }

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        if (!session && typeof navigator !== 'undefined' && !navigator.onLine && resumeOffline()) return;
        handleSession(session);
      }).catch((error: unknown) => {
        console.error('Error restoring session:', error);
        if (mounted && !(isNetworkError(error) && resumeOffline())) setLoading(false);
      });

      ({ data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'MFA_CHALLENGE_VERIFIED') void refreshAssurance();
        handleSession(session);
      }));
    } catch (error) {
      // Supabase env vars missing in dev: the client is a stub that throws.
      // Fall through to the login page (sign-in will report the config error).
      console.error('Auth initialisation failed:', error);
      setLoading(false);
    }

    // Back online after running from the saved copy: confirm the sign-in for real.
    const onOnline = () => {
      if (!profileUserId.current) return;
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        if (!mounted) return;
        if (!session) {
          // Session expired while away: ask them to sign in again.
          handleSession(null);
          return;
        }
        setOfflineSession(false);
        setUser(session.user);
        void loadUserProfile(session.user.id);
      }).catch(() => undefined);
    };
    window.addEventListener('online', onOnline);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUserProfile(authUserId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, role, site_id, store_id, full_name, is_active')
        .eq('id', authUserId)
        .single();

      if (error) throw error;

      // Switched off by an administrator: the login still exists in Supabase
      // Auth, but this person may no longer use the app.
      if (data && data.is_active === false) {
        toast({
          title: 'Account deactivated',
          description: 'This account has been switched off. Contact an administrator if you think that is a mistake.',
          variant: 'destructive',
        });
        await signOut().catch(console.error);
        return;
      }

      const profile: CachedProfile = {
        id: data?.id,
        role: data?.role ?? null,
        site_id: data?.site_id ?? null,
        store_id: data?.store_id ?? null,
        full_name: data?.full_name ?? null,
      };
      setCachedProfile(profile);
      setOfflineSession(false);
      applyProfile(profile);
      await refreshAssurance();
    } catch (error: any) {
      console.error('Error loading user profile:', error);
      // Let the next auth event (e.g. tab refocus) retry the load.
      profileUserId.current = null;

      // No signal: fall back to what this device remembers about them.
      if (isNetworkError(error)) {
        const cached = getCachedProfile();
        if (cached && cached.id === authUserId) {
          profileUserId.current = authUserId;
          applyProfile(cached);
          setOfflineSession(true);
        }
      } else if (error?.code === 'PGRST116') {
        // No row in `users` for this login. The account exists in Supabase Auth
        // but was never provisioned, so there is nothing to retry; sign out
        // instead of leaving them stuck on the login page.
        toast({
          title: 'Account not set up',
          description: 'Your login has no profile yet. Ask an administrator to finish setting up your account.',
          variant: 'destructive',
        });
        supabase.auth.signOut().catch(console.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function signOut() {
    // With no connection the server can't be told, so end just this device's
    // session; going through the network would fail and leave them signed in.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    let { error } = await supabase.auth.signOut(offline ? { scope: 'local' } : undefined);
    if (error && isNetworkError(error)) ({ error } = await supabase.auth.signOut({ scope: 'local' }));
    if (error) {
      if (
        error.name === 'AuthSessionMissingError' ||
        error.message.includes('Auth session missing')
      ) {
        // Safe to ignore, user is effectively already signed out. Make sure the
        // screen follows: with no session, no auth event is emitted.
        setUser(null);
        applyProfile(null);
        await purgeLocalData(profileUserId.current ?? getLastUser());
        setCachedProfile(null);
        setLastUser(null);
        profileUserId.current = null;
        return;
      }
      throw error;
    }
  }

  const value = {
    user,
    userRole,
    userId,
    userSiteId,
    userStoreId,
    userFullName,
    loading,
    aal,
    hasFactor,
    offlineSession,
    refreshAssurance,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
