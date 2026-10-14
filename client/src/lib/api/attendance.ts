import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import type { AttendanceRow, AttendanceStatus, WorkerType } from '../types';
import { enqueueMark } from '../offline/queue';
import { isNetworkError, qk } from './util';

// Everyone marked on one date. Refreshes on its own so two people marking the
// same site see each other's work.
export function useAttendanceOn(date: string) {
  return useQuery({
    queryKey: [...qk.attendance, 'day', date],
    // Live updates (lib/realtime) refresh this at once; the timer is only a safety net.
    refetchInterval: 60_000,
    queryFn: () =>
      fetchAllRows<AttendanceRow>(() =>
        supabase.from('attendance').select('*').eq('date', date).order('timestamp', { ascending: false }).order('id'),
      ),
  });
}

// Days that count towards pay for a month. Paged: a month easily exceeds the
// 1000-row response cap, which would otherwise silently under-count days worked.
export function useMonthAttendance(month: string, enabled = true) {
  return useQuery({
    queryKey: [...qk.attendance, 'month', month],
    enabled,
    queryFn: () => {
      const start = startOfMonth(parseISO(`${month}-01`));
      const end = endOfMonth(start);
      return fetchAllRows<Pick<AttendanceRow, 'worker_id' | 'date' | 'status'>>(() =>
        supabase
          .from('attendance')
          .select('worker_id, date, status')
          .gte('date', format(start, 'yyyy-MM-dd'))
          .lte('date', format(end, 'yyyy-MM-dd'))
          .in('status', ['Present', 'Half Day'])
          .order('id'),
      );
    },
  });
}

export interface MarkInput {
  workerId: string;
  workerName: string | null;
  workerType: WorkerType;
  date: string;
  status: AttendanceStatus;
  markedBy: string;
}

// What happened to a save: `saved` reached the server, `queued` were kept on
// this phone to be sent when the connection returns.
export interface MarkOutcome {
  queued: number;
  saved: string[];
}

const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function queue(inputs: MarkInput[]): Promise<MarkOutcome> {
  for (const i of inputs) await enqueueMark(i);
  return { queued: inputs.length, saved: [] };
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.attendance });

  // Plain insert, not upsert: a marked day is locked, and our copy of the list
  // can be up to 30s stale. An upsert would let a second supervisor silently
  // overwrite what the first just recorded. The UNIQUE (worker_id, date)
  // constraint rejects the duplicate instead.
  const markOne = useMutation({
    mutationFn: async (input: MarkInput): Promise<MarkOutcome> => {
      // No signal: keep the mark on this phone and send it later.
      if (offlineNow()) return queue([input]);
      const { error } = await supabase.from('attendance').insert({
        worker_id: input.workerId,
        date: input.date,
        status: input.status,
        marked_by: input.markedBy,
        worker_type: input.workerType,
      });
      if (error && isNetworkError(error)) return queue([input]);
      if (error) {
        if (error.code === '23505') {
          throw new Error(`${input.workerName || 'This worker'} was already marked for this date by someone else. The list has been refreshed.`);
        }
        throw error;
      }
      return { queued: 0, saved: [input.workerId] };
    },
    onSettled: refresh,
  });

  // ignoreDuplicates => ON CONFLICT DO NOTHING: anyone marked in the meantime
  // is left as-is, and .select() returns only the rows actually inserted.
  const markMany = useMutation({
    mutationFn: async (inputs: MarkInput[]): Promise<MarkOutcome> => {
      if (inputs.length === 0) return { queued: 0, saved: [] };
      if (offlineNow()) return queue(inputs);
      const { data, error } = await supabase
        .from('attendance')
        .upsert(
          inputs.map((i) => ({
            worker_id: i.workerId,
            date: i.date,
            status: i.status,
            marked_by: i.markedBy,
            worker_type: i.workerType,
          })),
          { onConflict: 'worker_id,date', ignoreDuplicates: true },
        )
        .select('worker_id');
      if (error && isNetworkError(error)) return queue(inputs);
      if (error) throw error;
      return { queued: 0, saved: (data ?? []).map((r: { worker_id: string }) => r.worker_id) };
    },
    onSettled: refresh,
  });

  const markHalfDay = useMutation({
    mutationFn: async (recordId: string) => {
      const { data, error } = await supabase
        .from('attendance')
        .update({ status: 'Half Day' })
        .eq('id', recordId)
        .eq('status', 'Present')
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Only a worker marked Present can be changed to a half day.');
    },
    onSettled: refresh,
  });

  return { markOne, markMany, markHalfDay };
}
