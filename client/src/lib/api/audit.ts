import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { AuditRow } from '../types';
import { qk } from './util';

export interface AuditFilter {
  table?: string;
  action?: string;
  userId?: string;
  /** Inclusive day range, YYYY-MM-DD. */
  from?: string;
  to?: string;
}

// The audit log is written by database triggers; this only reads it.
export function useAuditLog(filter: AuditFilter, limit: number) {
  return useQuery({
    queryKey: [...qk.audit, filter, limit],
    queryFn: async () => {
      let query = supabase.from('audit_log').select('*');
      if (filter.table) query = query.eq('table_name', filter.table);
      if (filter.action) query = query.eq('action', filter.action);
      if (filter.userId) query = query.eq('changed_by', filter.userId);
      if (filter.from) query = query.gte('changed_at', `${filter.from}T00:00:00`);
      if (filter.to) query = query.lte('changed_at', `${filter.to}T23:59:59.999`);
      const { data, error } = await query.order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      return data as AuditRow[];
    },
  });
}

// What actually changed in an UPDATE: only the keys whose value differs.
export function changedFields(row: Pick<AuditRow, 'old_data' | 'new_data' | 'action'>): { key: string; before: unknown; after: unknown }[] {
  const before = row.old_data ?? {};
  const after = row.new_data ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return keys
    .filter((k) => row.action !== 'UPDATE' || JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}
