import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import { transferWorker, type TransferInput } from '../worker-transfer';
import type { TransferRow, WorkerRow, WorkerType } from '../types';
import { qk } from './util';

// One shape for every worker list in the app (with pay rates, site and
// account site joined), so all screens can share the same cache entry.
const WORKER_SELECT =
  '*, portfolios(portfolio_name, rate), positions(position_name, rate), site:sites!site_id(id, site_name), account_site:sites!account_location(id, site_name)';

export interface WorkerFilter {
  siteId?: string | null;
  type?: WorkerType;
  enabled?: boolean;
}

export function useWorkers(filter: WorkerFilter = {}) {
  return useQuery({
    queryKey: [...qk.workers, filter.siteId ?? 'all', filter.type ?? 'all'],
    enabled: filter.enabled ?? true,
    queryFn: () =>
      fetchAllRows<WorkerRow>(() => {
        let query = supabase.from('workers').select(WORKER_SELECT);
        if (filter.siteId) query = query.eq('site_id', filter.siteId);
        if (filter.type) query = query.eq('worker_type', filter.type);
        return query.order('name').order('id');
      }),
  });
}

// Workers whose name matches, anywhere except `excludeSiteId`. Used by a
// supervisor to mark someone who is working away from their home site.
export async function searchWorkersElsewhere(name: string, excludeSiteId: string | null): Promise<WorkerRow[]> {
  let query = supabase.from('workers').select(WORKER_SELECT).ilike('name', `%${name.trim()}%`);
  // "Elsewhere" also includes workers with no site: a bare .neq() would hide
  // them (NULL is never not-equal) and sends the literal "null" to a uuid column
  // when the supervisor has no site of their own.
  if (excludeSiteId) query = query.or(`site_id.is.null,site_id.neq.${excludeSiteId}`);
  const { data, error } = await query.order('name').limit(25);
  if (error) throw error;
  return data as WorkerRow[];
}

export type WorkerPayload = Partial<Omit<WorkerRow, 'id' | 'created_at' | 'portfolios' | 'positions' | 'site' | 'account_site'>>;

export function useSaveWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: WorkerPayload }) => {
      const { error } = id
        ? await supabase.from('workers').update(values).eq('id', id)
        : await supabase.from('workers').insert(values);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.workers }),
  });
}

export function useDeleteWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('workers').delete().eq('id', id).select('id');
      if (error) throw error;
      // RLS hides rows you may not delete instead of raising an error.
      if (!data?.length) throw Object.assign(new Error('Not deleted'), { code: '42501' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.workers }),
  });
}

export function useTransfers(limit = 50) {
  return useQuery({
    queryKey: [...qk.transfers, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as TransferRow[];
    },
  });
}

export function useTransferWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferInput) => transferWorker(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.workers });
      queryClient.invalidateQueries({ queryKey: qk.transfers });
    },
  });
}
