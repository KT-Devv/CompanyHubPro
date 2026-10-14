import { useMemo, useState } from 'react';
import { AlertTriangle, Landmark, Loader2, Lock, LockOpen } from 'lucide-react';
import { prepareBankPayments, bankFileRows, BANK_FILE_HEADER } from '@/lib/bank-file';
import { totalPayroll, type PayrollLine } from '@/lib/payroll';
import { exportTable } from '@/lib/export';
import { money } from '@/lib/format';
import { errorMessage } from '@/lib/api/util';
import { useClosePayroll, useReopenPayroll } from '@/lib/api/payroll';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ExportMenu } from '@/components/common/export-menu';
import { Field } from '@/components/common/controls';

// ------------------------------------------------------------------ Close a month
export function CloseMonthDialog({ open, onOpenChange, month, monthLabel, lines }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  monthLabel: string;
  lines: PayrollLine[];
}) {
  const { toast } = useToast();
  const close = useClosePayroll();
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => totalPayroll(lines), [lines]);
  const overdrawn = lines.filter((l) => l.overdrawn).length;
  // People who will be left out of the bank file (not those who simply earned nothing).
  const unpayable = useMemo(() => prepareBankPayments(lines, month).skipped.filter((s) => s.reason !== 'nothing_to_pay'), [lines, month]);

  async function confirm() {
    setError(null);
    try {
      await close.mutateAsync(month);
      toast({ title: `${monthLabel} closed`, description: 'The figures are now frozen. You can produce payslips and the bank file.' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!close.isPending) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close {monthLabel}?</DialogTitle>
          <DialogDescription>
            This freezes the month's pay exactly as shown. Attendance, advances, loans and deductions dated in {monthLabel} can no longer be added or changed. Only the CEO can reopen it, and the reason is recorded.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-alabaster p-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Workers</dt><dd className="num font-semibold">{totals.workers}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Gross</dt><dd className="num font-semibold">{money(totals.gross)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Net payable</dt><dd className="num font-semibold">{money(totals.net)}</dd></div>
        </dl>

        {(overdrawn > 0 || unpayable.length > 0) && (
          <ul className="space-y-2 text-sm" data-testid="close-warnings">
            {overdrawn > 0 && (
              <li className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{overdrawn} worker{overdrawn === 1 ? ' has' : 's have'} deductions larger than their pay, so their net pay is zero.</span>
              </li>
            )}
            {unpayable.length > 0 && (
              <li className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{unpayable.length} worker{unpayable.length === 1 ? ' has' : 's have'} no usable bank details, so they will be left out of the bank file ({unpayable.slice(0, 3).map((u) => u.name).join(', ')}{unpayable.length > 3 ? ' and others' : ''}). Fix their details before closing, or pay them another way.</span>
              </li>
            )}
          </ul>
        )}

        {error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={close.isPending}>Cancel</Button>
          <Button onClick={confirm} disabled={close.isPending || lines.length === 0} data-testid="button-confirm-close">
            {close.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock />} Close month
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Reopen a month
export function ReopenMonthDialog({ open, onOpenChange, month, monthLabel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  monthLabel: string;
}) {
  const { toast } = useToast();
  const reopen = useReopenPayroll();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= 5;

  async function confirm() {
    setError(null);
    try {
      await reopen.mutateAsync({ month, reason: reason.trim() });
      toast({ title: `${monthLabel} reopened`, description: 'Changes are allowed again. Close the month again when you are done.' });
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!reopen.isPending) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {monthLabel}?</DialogTitle>
          <DialogDescription>
            The frozen figures are removed (and kept in the audit log) and the month becomes editable again. Payslips or bank files already produced will no longer match until it is closed again.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="reopen-reason" hint="At least 5 characters. Recorded against your name.">
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-testid="input-reopen-reason" />
        </Field>
        {error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={reopen.isPending}>Cancel</Button>
          <Button onClick={confirm} disabled={!valid || reopen.isPending} data-testid="button-confirm-reopen">
            {reopen.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <LockOpen />} Reopen month
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Bank payment file
export function BankFileDialog({ open, onOpenChange, month, monthLabel, lines }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  monthLabel: string;
  lines: PayrollLine[];
}) {
  const plan = useMemo(() => prepareBankPayments(lines, month), [lines, month]);
  const attention = plan.skipped.filter((s) => s.reason !== 'nothing_to_pay');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bank payment file, {monthLabel}</DialogTitle>
          <DialogDescription>One line per worker to be credited by bank transfer. Check the totals against your approved payroll before sending it to the bank.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-alabaster p-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4" aria-hidden /> To be paid</p>
          <p className="num mt-1 text-2xl font-semibold" data-testid="bank-total">{money(plan.total)}</p>
          <p className="text-sm text-muted-foreground">{plan.payments.length} payment{plan.payments.length === 1 ? '' : 's'}</p>
          {plan.byBank.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {plan.byBank.map((b) => (
                <li key={b.bank} className="flex justify-between gap-3"><span>{b.bank} <span className="text-muted-foreground">({b.count})</span></span><span className="num">{money(b.total)}</span></li>
              ))}
            </ul>
          )}
        </div>

        {attention.length > 0 && (
          <div className="rounded-lg border border-warning-line bg-warning-soft p-3 text-sm" data-testid="bank-skipped">
            <p className="flex items-center gap-2 font-medium text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /> {attention.length} left out: fix their details, then download again</p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {attention.map((s) => (
                <li key={s.workerId} className="flex justify-between gap-3"><span>{s.name}<span className="text-muted-foreground">: {s.message}</span></span><span className="num shrink-0">{money(s.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <ExportMenu
            variant="default"
            label="Download file"
            formats={['csv', 'xlsx']}
            disabled={plan.payments.length === 0}
            onExport={(format) =>
              exportTable(format, {
                baseName: `bank-payments-${month}`,
                title: `Bank payment file, ${monthLabel}`,
                subtitle: `${plan.payments.length} payments, total ${money(plan.total)}`,
                head: BANK_FILE_HEADER,
                body: bankFileRows(plan.payments).slice(1).map((r) => [r[0], r[1], String(r[2]), Number(r[3]), r[4], r[5]]),
                foot: ['Total', '', '', plan.total, '', ''],
                moneyColumns: [3],
              })
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
