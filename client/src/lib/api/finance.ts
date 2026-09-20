import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { LedgerRow } from '../types';
import { qk } from './util';

export type LedgerTable = 'salary_advances' | 'loans' | 'deductions';

export const LEDGER_LABEL: Record<LedgerTable, { singular: string; plural: string }> = {
  salary_advances: { singular: 'Advance', plural: 'Advances' },
  loans: { singular: 'Loan', plural: 'Loans' },
  deductions: { singular: 'Deduction', plural: 'Deductions' },
};

// Entries recorded against one pay month (YYYY-MM).
export function useLedger(table: LedgerTable, month: string) {
  return useQuery({
    queryKey: [...qk.finance, table, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('month', month)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as LedgerRow[];
    },
  });
}

export interface LedgerInput {
  workerId: string;
  amount: number;
  month: string;
  date: string;
  notes?: string;
}

export function useAddLedgerEntry(table: LedgerTable) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LedgerInput) => {
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Amount must be a whole number above zero.');
      const { error } = await supabase.from(table).insert({
        worker_id: input.workerId,
        amount: input.amount,
        month: input.month,
        date: input.date,
        notes: input.notes?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...qk.finance, table] }),
  });
}
