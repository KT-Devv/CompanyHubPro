import { cents, type PayrollLine } from './payroll';

// Statutory schedules for the pension (SSNIT) and income-tax (PAYE) returns,
// built from a month's payroll lines. The rates themselves live in payroll.ts
// (employee SSNIT 5.5%, income tax 10%); the employer's SSNIT contribution is
// the one extra figure the pension return needs.
//
// These follow the pay rules this system has always used. Confirm the rates and
// the tax method with your accountant: this schedule is only as right as those.
export const EMPLOYER_SSNIT_RATE = 0.13;

export interface SsnitRow {
  name: string;
  nationalId: string;
  gross: number;
  employee: number;
  employer: number;
  total: number;
}

export interface PayeRow {
  name: string;
  nationalId: string;
  gross: number;
  ssnit: number;
  taxable: number;
  tax: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const sumOf = <T,>(rows: T[], pick: (r: T) => number) => cents(rows.reduce((t, r) => t + pick(r) * 100, 0) / 100);

export function ssnitSchedule(lines: PayrollLine[]) {
  const rows: SsnitRow[] = lines
    .filter((l) => l.gross > 0)
    .map((l) => {
      const employer = cents(l.gross * EMPLOYER_SSNIT_RATE);
      return { name: l.name, nationalId: l.nationalId, gross: l.gross, employee: l.ssnit, employer, total: cents(l.ssnit + employer) };
    })
    .sort(byName);
  return {
    rows,
    totals: {
      gross: sumOf(rows, (r) => r.gross),
      employee: sumOf(rows, (r) => r.employee),
      employer: sumOf(rows, (r) => r.employer),
      total: sumOf(rows, (r) => r.total),
    },
  };
}

export function payeSchedule(lines: PayrollLine[]) {
  const rows: PayeRow[] = lines
    .filter((l) => l.gross > 0)
    .map((l) => ({ name: l.name, nationalId: l.nationalId, gross: l.gross, ssnit: l.ssnit, taxable: cents(Math.max(0, l.gross - l.ssnit)), tax: l.tax }))
    .sort(byName);
  return {
    rows,
    totals: {
      gross: sumOf(rows, (r) => r.gross),
      ssnit: sumOf(rows, (r) => r.ssnit),
      taxable: sumOf(rows, (r) => r.taxable),
      tax: sumOf(rows, (r) => r.tax),
    },
  };
}
