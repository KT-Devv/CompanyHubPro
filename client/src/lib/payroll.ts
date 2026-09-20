import type { AttendanceStatus, WorkerType } from './types';

// Statutory rates. SSNIT is taken from gross; income tax is then charged on the
// remainder. These are the rates the app has always used; change them here.
export const SSNIT_RATE = 0.055;
export const TAX_RATE = 0.1;

export interface PayrollWorker {
  id: string;
  name: string | null;
  worker_type: WorkerType | string | null;
  portfolios?: { portfolio_name: string; rate: number } | null;
  positions?: { position_name: string; rate: number | null } | null;
  site?: { site_name: string } | null;
  account_site?: { site_name: string } | null;
  account_number?: string | null;
}

export interface AttendanceDay {
  worker_id: string;
  status: AttendanceStatus | string;
}

export interface LedgerAmount {
  worker_id: string;
  amount: number;
}

export interface PayrollLine {
  workerId: string;
  name: string;
  workerType: WorkerType;
  siteName: string;
  jobTitle: string;
  rate: number;
  /** Days worked (a half day counts 0.5). Always 0 for fixed-salary staff. */
  daysPresent: number;
  /** Non-marking (office) staff are paid their position's rate every month. */
  fixed: boolean;
  gross: number;
  ssnit: number;
  tax: number;
  advances: number;
  loans: number;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  /** Deductions exceed gross pay, so the net is floored at zero. */
  overdrawn: boolean;
  accountSite: string;
  accountNumber: string;
}

export function dayCredit(status: string): number {
  if (status === 'Present') return 1;
  if (status === 'Half Day') return 0.5;
  return 0;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function sumByWorker(rows: LedgerAmount[] | undefined): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows ?? []) {
    totals.set(row.worker_id, (totals.get(row.worker_id) ?? 0) + (row.amount || 0));
  }
  return totals;
}

export interface PayrollInput {
  workers: PayrollWorker[];
  attendance: AttendanceDay[];
  advances: LedgerAmount[];
  loans: LedgerAmount[];
  deductions: LedgerAmount[];
}

// One line per casual / non-marking worker. Workers of any other (legacy) type
// have no pay rule and are left out.
export function computePayroll({ workers, attendance, advances, loans, deductions }: PayrollInput): PayrollLine[] {
  const days = new Map<string, number>();
  for (const row of attendance) {
    days.set(row.worker_id, (days.get(row.worker_id) ?? 0) + dayCredit(row.status));
  }
  const advanceTotals = sumByWorker(advances);
  const loanTotals = sumByWorker(loans);
  const deductionTotals = sumByWorker(deductions);

  const lines: PayrollLine[] = [];
  for (const worker of workers) {
    if (worker.worker_type !== 'casual' && worker.worker_type !== 'non_marking') continue;
    const fixed = worker.worker_type === 'non_marking';

    const rate = (fixed ? worker.positions?.rate : worker.portfolios?.rate) ?? 0;
    const jobTitle = (fixed ? worker.positions?.position_name : worker.portfolios?.portfolio_name) || '-';
    const daysPresent = fixed ? 0 : days.get(worker.id) ?? 0;

    const gross = cents(fixed ? rate : daysPresent * rate);
    const ssnit = cents(gross * SSNIT_RATE);
    const tax = cents(Math.max(0, gross - ssnit) * TAX_RATE);
    const advancesTotal = advanceTotals.get(worker.id) ?? 0;
    const loansTotal = loanTotals.get(worker.id) ?? 0;
    const otherDeductions = deductionTotals.get(worker.id) ?? 0;

    const totalDeductions = cents(ssnit + tax + advancesTotal + loansTotal + otherDeductions);
    lines.push({
      workerId: worker.id,
      name: worker.name || '',
      workerType: worker.worker_type as WorkerType,
      siteName: worker.site?.site_name || 'N/A',
      jobTitle,
      rate,
      daysPresent,
      fixed,
      gross,
      ssnit,
      tax,
      advances: advancesTotal,
      loans: loansTotal,
      otherDeductions,
      totalDeductions,
      net: cents(Math.max(0, gross - totalDeductions)),
      overdrawn: totalDeductions > gross,
      accountSite: worker.account_site?.site_name || '-',
      accountNumber: worker.account_number || '-',
    });
  }
  return lines;
}

export interface PayrollTotals {
  workers: number;
  gross: number;
  ssnit: number;
  tax: number;
  advances: number;
  loans: number;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
}

export function totalPayroll(lines: PayrollLine[]): PayrollTotals {
  const t: PayrollTotals = { workers: lines.length, gross: 0, ssnit: 0, tax: 0, advances: 0, loans: 0, otherDeductions: 0, totalDeductions: 0, net: 0 };
  for (const l of lines) {
    t.gross += l.gross;
    t.ssnit += l.ssnit;
    t.tax += l.tax;
    t.advances += l.advances;
    t.loans += l.loans;
    t.otherDeductions += l.otherDeductions;
    t.totalDeductions += l.totalDeductions;
    t.net += l.net;
  }
  return {
    workers: t.workers,
    gross: cents(t.gross),
    ssnit: cents(t.ssnit),
    tax: cents(t.tax),
    advances: cents(t.advances),
    loans: cents(t.loans),
    otherDeductions: cents(t.otherDeductions),
    totalDeductions: cents(t.totalDeductions),
    net: cents(t.net),
  };
}
