import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { toast } from '@/hooks/use-toast';
import type { User } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  userId: string | null;
  userSiteId: string | null;
  userStoreId: string | null;
  userFullName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSiteId, setUserSiteId] = useState<string | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which auth user the profile state currently belongs to. Supabase re-emits
  // SIGNED_IN on every tab refocus and token refresh; without this we'd reload
  // the profile (and, if we flipped `loading`, blank the page) each time.
  const profileUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    function handleSession(session: Session | null) {
      if (!mounted) return;
      setUser(session?.user ?? null);

      if (!session?.user) {
        profileUserId.current = null;
        setUserRole(null);
        setUserId(null);
        setUserSiteId(null);
        setUserStoreId(null);
        setUserFullName(null);
        setLoading(false);
        return;
      }

      if (profileUserId.current === session.user.id) return;
      profileUserId.current = session.user.id;
      // Hold the router on its spinner until we know the role, so a fresh
      // sign-in doesn't bounce through /login while the profile loads.
      setLoading(true);
      const authUserId = session.user.id;
      // Deferred: supabase-js can deadlock if the client is called from inside
      // its own auth-state callback.
      setTimeout(() => {
        if (mounted) loadUserProfile(authUserId);
      }, 0);
    }

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        handleSession(session);
      }).catch((error: unknown) => {
        console.error('Error restoring session:', error);
        if (mounted) setLoading(false);
      });

      ({ data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
        if (event !== 'INITIAL_SESSION') handleSession(session);
      }));
    } catch (error) {
      // Supabase env vars missing in dev: the client is a stub that throws.
      // Fall through to the login page (sign-in will report the config error).
      console.error('Auth initialisation failed:', error);
      setLoading(false);
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function loadUserProfile(authUserId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, role, site_id, store_id, full_name')
        .eq('id', authUserId)
        .single();

      if (error) throw error;

      setUserRole(data?.role || null);
      setUserId(data?.id || null);
      setUserSiteId(data?.site_id || null);
      setUserStoreId(data?.store_id || null);
      setUserFullName(data?.full_name || null);
    } catch (error: any) {
      console.error('Error loading user profile:', error);
      // Let the next auth event (e.g. tab refocus) retry the load.
      profileUserId.current = null;
      // PGRST116: no row in `users` for this login. The account exists in
      // Supabase Auth but was never provisioned, so there is nothing to retry;
      // sign out instead of leaving them stuck on the login page.
      if (error?.code === 'PGRST116') {
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (
        error.name === 'AuthSessionMissingError' ||
        error.message.includes('Auth session missing')
      ) {
        // Safe to ignore, user is effectively already signed out
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
