import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import type { AttendanceStatus } from '../types';
import { qk } from './util';

export interface AttendanceDot {
  worker_id: string;
  date: string;
  status: AttendanceStatus;
}

// Attendance over a day range (inclusive), for trends. Paged: 30 days of a
// large site is well past the 1000-row response cap.
export function useAttendanceRange(from: string, to: string) {
  return useQuery({
    queryKey: [...qk.insights, 'attendance', from, to],
    staleTime: 60_000,
    queryFn: () =>
      fetchAllRows<AttendanceDot>(() =>
        supabase.from('attendance').select('worker_id, date, status').gte('date', from).lte('date', to).order('date').order('id'),
      ),
  });
}

export interface Movement {
  item_id: string;
  quantity: number;
  type: 'sent' | 'received';
  date: string;
  inventory: { item_name: string } | null;
}

// Goods sent since a day, for "what is moving".
export function useStockMovements(since: string, enabled = true) {
  return useQuery({
    queryKey: [...qk.insights, 'movements', since],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      fetchAllRows<Movement>(() =>
        supabase.from('goods_log').select('item_id, quantity, type, date, inventory(item_name)').eq('type', 'sent').gte('date', `${since}T00:00:00`).order('date').order('id'),
      ),
  });
}
