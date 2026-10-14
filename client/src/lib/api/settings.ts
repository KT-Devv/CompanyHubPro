import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { qk } from './util';

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('key, value');
      if (error) throw error;
      return Object.fromEntries((data as { key: string; value: string }[]).map((r) => [r.key, r.value])) as Record<string, string>;
    },
  });
}

// True when the CEO has switched on mandatory two-step sign-in. While loading
// (or if it can't be read) this is false, so a hiccup never locks people out of
// the app; the database enforces the rule regardless of what the screen thinks.
export function useRequireMfa(): boolean {
  const settings = useSettings();
  return settings.data?.require_mfa === 'true';
}

export function useSetSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.rpc('rpc_set_setting', { p_key: key, p_value: value });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.settings }),
  });
}
