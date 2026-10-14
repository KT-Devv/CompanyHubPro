import { useEffect } from 'react';
import { queryClient } from './queryClient';
import { supabase } from './supabase';
import { qk } from './api/util';

// Live updates: when someone else marks attendance or moves stock, this screen
// refreshes within a moment instead of waiting for the next poll. Row-level
// security still decides who is sent which change. If the live connection
// can't be made the screens simply keep refreshing on their own slower timers.
const WATCH: { table: string; invalidate: readonly (readonly string[])[] }[] = [
  { table: 'attendance', invalidate: [qk.attendance] },
  { table: 'goods_log', invalidate: [qk.goodsLogs, qk.inventory] },
  { table: 'inventory', invalidate: [qk.inventory] },
];

export function useRealtimeSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    // A burst of changes (a supervisor marking 40 workers) becomes one refresh.
    const schedule = (table: string, keys: readonly (readonly string[])[]) => {
      clearTimeout(pending.get(table));
      pending.set(table, setTimeout(() => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [...k] })), 400));
    };

    let channel: ReturnType<typeof supabase.channel> | undefined;
    try {
      channel = supabase.channel('db-changes');
      for (const { table, invalidate } of WATCH) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedule(table, invalidate));
      }
      channel.subscribe();
    } catch (error) {
      console.warn('Live updates unavailable:', error);
    }

    return () => {
      pending.forEach((t) => clearTimeout(t));
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
