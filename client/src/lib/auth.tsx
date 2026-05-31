import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
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

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        if (_event !== 'INITIAL_SESSION') {
          loadUserProfile(session.user.id);
        }
      } else {
        setUserRole(null);
        setUserId(null);
        setUserSiteId(null);
        setUserStoreId(null);
        setUserFullName(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
    } catch (error) {
      console.error('Error loading user profile:', error);
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
