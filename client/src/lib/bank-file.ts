import { format, parseISO } from 'date-fns';
import { cents, type PayrollLine } from './payroll';

// Payroll is paid by bank transfer, so the pay run needs a file the bank can
// import: one line per worker with the amount to credit. This builds that file
// from a CLOSED month's frozen figures, and lists everyone who can't be paid
// from it (no account, a malformed account number, nothing owed) so they are
// dealt with deliberately instead of being silently left out.

export interface BankPayment {
  workerId: string;
  name: string;
  bankName: string;
  accountNumber: string;
  amount: number;
  narration: string;
  reference: string;
}

export type SkipReason = 'nothing_to_pay' | 'no_account' | 'bad_account' | 'no_bank';

export interface BankSkip {
  workerId: string;
  name: string;
  amount: number;
  reason: SkipReason;
  message: string;
}

export interface BankFilePlan {
  payments: BankPayment[];
  skipped: BankSkip[];
  total: number;
  byBank: { bank: string; count: number; total: number }[];
}

const SKIP_MESSAGE: Record<SkipReason, string> = {
  nothing_to_pay: 'Nothing to pay this month',
  no_account: 'No account number on file',
  bad_account: 'The account number does not look valid',
  no_bank: 'No bank on file',
};

// Digits only once spaces and hyphens are removed; 8-20 digits covers the
// range of account numbers local banks issue.
export const cleanAccountNumber = (raw: string) => raw.replace(/[\s-]/g, '');
export const isValidAccountNumber = (raw: string) => /^\d{8,20}$/.test(cleanAccountNumber(raw));

export function narrationFor(month: string): string {
  return `Salary ${format(parseISO(`${month}-01`), 'MMM yyyy')}`;
}

export function prepareBankPayments(lines: PayrollLine[], month: string): BankFilePlan {
  const payments: BankPayment[] = [];
  const skipped: BankSkip[] = [];
  const skip = (l: PayrollLine, reason: SkipReason) =>
    skipped.push({ workerId: l.workerId, name: l.name || 'Unnamed worker', amount: l.net, reason, message: SKIP_MESSAGE[reason] });

  const sorted = [...lines].sort((a, b) => a.name.localeCompare(b.name) || a.workerId.localeCompare(b.workerId));
  for (const l of sorted) {
    const account = l.accountNumber === '-' ? '' : l.accountNumber.trim();
    if (l.net <= 0) skip(l, 'nothing_to_pay');
    else if (!account) skip(l, 'no_account');
    else if (!isValidAccountNumber(account)) skip(l, 'bad_account');
    else if (!l.bankName.trim()) skip(l, 'no_bank');
    else {
      payments.push({
        workerId: l.workerId,
        name: l.name || 'Unnamed worker',
        bankName: l.bankName.trim(),
        accountNumber: cleanAccountNumber(account),
        amount: l.net,
        narration: narrationFor(month),
        // Unique and stable within the run, so a bank statement line can be matched back to a payment.
        reference: `SAL-${month.replace('-', '')}-${String(payments.length + 1).padStart(3, '0')}`,
      });
    }
  }

  const byBank = new Map<string, { count: number; total: number }>();
  for (const p of payments) {
    const entry = byBank.get(p.bankName) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total = cents(entry.total + p.amount);
    byBank.set(p.bankName, entry);
  }

  return {
    payments,
    skipped,
    total: cents(payments.reduce((t, p) => t + p.amount * 100, 0) / 100),
    byBank: Array.from(byBank, ([bank, v]) => ({ bank, ...v })).sort((a, b) => a.bank.localeCompare(b.bank)),
  };
}

export const BANK_FILE_HEADER = ['Beneficiary name', 'Bank', 'Account number', 'Amount', 'Narration', 'Reference'];

export function bankFileRows(payments: BankPayment[]): (string | number)[][] {
  return [
    BANK_FILE_HEADER,
    ...payments.map((p) => [p.name, p.bankName, p.accountNumber, p.amount.toFixed(2), p.narration, p.reference]),
  ];
}
