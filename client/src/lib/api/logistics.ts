import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import {
  addToInventory,
  receiveAgainstLog,
  receiveUnexpected,
  sendGoods,
  type ReceiveAgainstLogInput,
  type ReceiveUnexpectedInput,
  type SendGoodsInput,
} from '../inventory';
import type { GoodsLogRow, InventoryRow } from '../types';
import { qk } from './util';

// Each item carries its own reorder level (min_quantity, default 10). An item
// needs reordering once the stock is at or below it. A level of 0 switches the
// alert off for that item.
export const isLowStock = (item: Pick<InventoryRow, 'quantity' | 'min_quantity'>) => item.min_quantity > 0 && item.quantity <= item.min_quantity;

const LOG_SELECT =
  '*, inventory(item_name), from_store:stores!goods_log_store_from_fkey(id,name), to_store:stores!goods_log_store_to_fkey(id,name)';

// storeId scopes to one store (a store manager's own); omit it for all stores.
export function useInventory(storeId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...qk.inventory, storeId ?? 'all'],
    enabled,
    refetchInterval: 60_000,
    queryFn: () =>
      fetchAllRows<InventoryRow>(() => {
        let query = supabase.from('inventory').select('*, stores(name, location)');
        if (storeId) query = query.eq('store_id', storeId);
        return query.order('item_name').order('id');
      }),
  });
}

// Recent movements, newest first. With a storeId: only those into or out of it.
export function useGoodsLogs(storeId?: string | null, enabled = true, limit = 60) {
  return useQuery({
    queryKey: [...qk.goodsLogs, 'recent', storeId ?? 'all', limit],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase.from('goods_log').select(LOG_SELECT);
      if (storeId) query = query.or(`store_from.eq.${storeId},store_to.eq.${storeId}`);
      const { data, error } = await query.order('date', { ascending: false }).limit(limit);
      if (error) throw error;
      return data as GoodsLogRow[];
    },
  });
}

// Shipments waiting to be received. Queried on their own, not taken from the
// recent-history list: a pending shipment older than the newest N logs would
// otherwise drop out and could never be received.
export function useIncomingLogs(storeId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...qk.goodsLogs, 'incoming', storeId ?? 'all'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase.from('goods_log').select(LOG_SELECT).eq('type', 'sent').eq('status', 'pending');
      if (storeId) query = query.eq('store_to', storeId);
      const { data, error } = await query.order('date', { ascending: true });
      if (error) throw error;
      return data as GoodsLogRow[];
    },
  });
}

function useRefreshStock() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: qk.inventory });
    queryClient.invalidateQueries({ queryKey: qk.goodsLogs });
  };
}

export function useAddStock() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (v: { storeId: string; itemName: string; quantity: number; remarks?: string }) => {
      if (!v.storeId) throw new Error('Choose a store.');
      if (!Number.isInteger(v.quantity) || v.quantity < 0) throw new Error('Quantity must be zero or more.');
      return addToInventory(v.storeId, v.itemName, v.quantity, v.remarks);
    },
    onSuccess: refresh,
  });
}

// Changing the level also clears the "already alerted" mark, so the next time
// the item runs low the alert fires again.
export function useSetReorderLevel() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: async ({ itemId, level }: { itemId: string; level: number }) => {
      if (!Number.isInteger(level) || level < 0) throw new Error('The reorder level must be a whole number, zero or more.');
      const { data, error } = await supabase.from('inventory').update({ min_quantity: level, low_alerted_at: null }).eq('id', itemId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error("You can't change the reorder level for this item.");
    },
    onSuccess: refresh,
  });
}

export function useSendGoods() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (v: SendGoodsInput) => sendGoods(v),
    onSuccess: refresh,
  });
}

export function useReceiveGoods() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (v: ReceiveAgainstLogInput) => receiveAgainstLog(v),
    onSuccess: refresh,
  });
}

export function useReceiveUnexpected() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (v: ReceiveUnexpectedInput) => receiveUnexpected(v),
    onSuccess: refresh,
  });
}
