import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { UserProfile } from '../types';
import { qk } from './util';

export function useAccounts() {
  return useQuery({
    queryKey: [...qk.users, 'accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, site_id, store_id, is_active')
        .order('full_name');
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

export interface AccountChange {
  userId: string;
  role: string;
  siteId: string | null;
  storeId: string | null;
  isActive: boolean;
  /** Whether the active flag changed, so the login itself should be blocked or unblocked too. */
  activeChanged: boolean;
}

// Everything about an existing account goes through one database function that
// checks who is asking (there is deliberately no plain UPDATE on users).
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (c: AccountChange) => {
      const { error } = await supabase.rpc('rpc_admin_update_user', {
        p_user_id: c.userId,
        p_role: c.role,
        p_site_id: c.siteId,
        p_store_id: c.storeId,
        p_is_active: c.isActive,
      });
      if (error) throw error;
      // The database already cuts off access the moment is_active is false. Also
      // blocking the login stops it refreshing a session at all; this is best
      // effort (it needs the admin-users function deployed) and never fails the change.
      if (c.activeChanged) {
        await supabase.functions.invoke('admin-users', { body: { action: 'sync_ban', user_id: c.userId, banned: !c.isActive } }).catch(() => undefined);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.users });
      queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export interface Invite {
  email: string;
  fullName: string;
  role: string;
  siteId: string | null;
  storeId: string | null;
}

// Creating a login needs the auth admin API (a secret key that never reaches the
// browser), so it is done by the admin-users edge function, which checks the
// caller is the CEO or a system manager before doing anything.
export function useInviteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invite: Invite) => {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'invite', email: invite.email, full_name: invite.fullName, role: invite.role, site_id: invite.siteId, store_id: invite.storeId },
      });
      if (error) throw new Error(await functionErrorMessage(error));
      return data as { id: string; email: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.users });
      queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

// supabase-js hides the function's own JSON error body inside `error.context`.
export async function functionErrorMessage(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: Response } | null;
  try {
    const body = await e?.context?.clone().json();
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch {
    /* not JSON */
  }
  if (/not found|failed to send a request|404/i.test(e?.message ?? '')) {
    return 'The account service is not set up yet. Deploy the admin-users function (see supabase/README.md).';
  }
  return e?.message || 'Something went wrong. Please try again.';
}
