import { computePayroll, type AttendanceDay, type LedgerAmount, type PayrollLine, type PayrollWorker } from '../lib/payroll';
import type { Row, Tables } from './seed';

// Workers shaped the way the real query returns them (rates and sites joined).
export function payrollWorkersFrom(t: Tables): PayrollWorker[] {
  const siteName = (id: string | null) => (t.sites.find((x) => x.id === id)?.site_name as string | undefined) ?? null;
  return t.workers.map((w) => {
    const pf = t.portfolios.find((x) => x.id === w.portfolio_id);
    const pos = t.positions.find((x) => x.id === w.position_id);
    const site = siteName(w.site_id);
    const acct = siteName(w.account_location);
    return {
      id: w.id,
      name: w.name,
      worker_type: w.worker_type,
      portfolios: pf ? { portfolio_name: pf.portfolio_name, rate: pf.rate } : null,
      positions: pos ? { position_name: pos.position_name, rate: pos.rate } : null,
      site: site ? { site_name: site } : null,
      account_site: acct ? { site_name: acct } : null,
      national_id: w.national_id,
      bank_name: w.bank_name,
      account_number: w.account_number,
    };
  });
}

export function computeMonth(db: Tables, month: string): PayrollLine[] {
  return computePayroll({
    workers: payrollWorkersFrom(db),
    attendance: db.attendance.filter((a) => String(a.date).startsWith(month)) as AttendanceDay[],
    advances: db.salary_advances.filter((r) => r.month === month) as LedgerAmount[],
    loans: db.loans.filter((r) => r.month === month) as LedgerAmount[],
    deductions: db.deductions.filter((r) => r.month === month) as LedgerAmount[],
  });
}

// A computed line as a payroll_lines / payroll_compute row (snake_case, nulls for "none").
export function lineToRow(month: string, l: PayrollLine): Row {
  return {
    month, worker_id: l.workerId, worker_name: l.name, worker_type: l.workerType, national_id: l.nationalId || null,
    site_name: l.siteName === 'N/A' ? null : l.siteName, job_title: l.jobTitle === '-' ? null : l.jobTitle,
    rate: l.rate, days_present: l.daysPresent, fixed: l.fixed, gross: l.gross, ssnit: l.ssnit, tax: l.tax,
    advances: l.advances, loans: l.loans, other_deductions: l.otherDeductions, total_deductions: l.totalDeductions,
    net: l.net, overdrawn: l.overdrawn, bank_name: l.bankName || null,
    account_site: l.accountSite === '-' ? null : l.accountSite, account_number: l.accountNumber === '-' ? null : l.accountNumber,
  };
}
