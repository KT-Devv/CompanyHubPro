import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { fetchAllRows } from '../fetch-all';
import type { PayrollLine } from '../payroll';
import type { PayrollLineRow, PayrollPeriod, PayrollReopen, WorkerType } from '../types';
import { qk } from './util';

// Every month that has been closed, newest first.
export function usePayrollPeriods() {
  return useQuery({
    queryKey: [...qk.payroll, 'periods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_periods').select('*').order('month', { ascending: false });
      if (error) throw error;
      return data as PayrollPeriod[];
    },
  });
}

// The frozen lines of one closed month.
export function usePayrollSnapshot(month: string, enabled: boolean) {
  return useQuery({
    queryKey: [...qk.payroll, 'lines', month],
    enabled,
    queryFn: () =>
      fetchAllRows<PayrollLineRow>(() =>
        supabase.from('payroll_lines').select('*').eq('month', month).order('worker_name').order('worker_id'),
      ),
  });
}

export function usePayrollReopens(month: string, enabled: boolean) {
  return useQuery({
    queryKey: [...qk.payroll, 'reopens', month],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_reopens').select('*').eq('month', month).order('reopened_at', { ascending: false });
      if (error) throw error;
      return data as PayrollReopen[];
    },
  });
}

function useRefreshPayroll() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: qk.payroll });
    queryClient.invalidateQueries({ queryKey: qk.finance });
    queryClient.invalidateQueries({ queryKey: qk.attendance });
    queryClient.invalidateQueries({ queryKey: qk.audit });
  };
}

// Freezes a finished month. Done by the database in one transaction, from its own
// copy of the pay rules, so what's frozen is exactly what its calculation says.
export function useClosePayroll() {
  const refresh = useRefreshPayroll();
  return useMutation({
    mutationFn: async (month: string) => {
      const { error } = await supabase.rpc('rpc_close_payroll', { p_month: month });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useReopenPayroll() {
  const refresh = useRefreshPayroll();
  return useMutation({
    mutationFn: async ({ month, reason }: { month: string; reason: string }) => {
      const { error } = await supabase.rpc('rpc_reopen_payroll', { p_month: month, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

// A frozen row as the same shape the live calculation produces, so the Finance
// screen, the exports and the payslips don't care which one they were given.
export function linesFromSnapshot(rows: PayrollLineRow[]): PayrollLine[] {
  return rows.map((r) => ({
    workerId: r.worker_id,
    name: r.worker_name ?? '',
    workerType: r.worker_type as WorkerType,
    siteName: r.site_name || 'N/A',
    jobTitle: r.job_title || '-',
    rate: Number(r.rate),
    daysPresent: Number(r.days_present),
    fixed: r.fixed,
    gross: Number(r.gross),
    ssnit: Number(r.ssnit),
    tax: Number(r.tax),
    advances: Number(r.advances),
    loans: Number(r.loans),
    otherDeductions: Number(r.other_deductions),
    totalDeductions: Number(r.total_deductions),
    net: Number(r.net),
    overdrawn: r.overdrawn,
    nationalId: r.national_id ?? '',
    bankName: r.bank_name ?? '',
    accountSite: r.account_site || '-',
    accountNumber: r.account_number || '-',
  }));
}
