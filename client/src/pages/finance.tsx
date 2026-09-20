import { Fragment, useMemo, useState } from 'react';
import { endOfMonth, format, parseISO } from 'date-fns';
import { ChevronRight, Download, Info, Landmark, Loader2, Plus, ReceiptText, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { downloadCsv } from '@/lib/csv';
import { formatDay, money, monthISO, todayISO } from '@/lib/format';
import { computePayroll, totalPayroll, type PayrollLine } from '@/lib/payroll';
import { useSort } from '@/lib/use-sort';
import { errorMessage } from '@/lib/api/util';
import { useWorkers } from '@/lib/api/workers';
import { useMonthAttendance } from '@/lib/api/attendance';
import { LEDGER_LABEL, useAddLedgerEntry, useLedger, type LedgerTable } from '@/lib/api/finance';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { WorkerTypeBadge } from '@/components/common/status-badge';
import { Field, MonthSelect, Segmented, SearchInput, SortHead, WorkerPicker } from '@/components/common/controls';

const LEDGER_TABLES: LedgerTable[] = ['salary_advances', 'loans', 'deductions'];

export default function FinancePage() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isCeo = userRole === 'ceo';
  const current = monthISO();

  const [month, setMonth] = useState(current);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'casual' | 'non_marking'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const workers = useWorkers();
  const attendance = useMonthAttendance(month);
  const advances = useLedger('salary_advances', month);
  const loans = useLedger('loans', month);
  const deductions = useLedger('deductions', month);

  const inProgress = month === current;
  const monthLabel = format(parseISO(`${month}-01`), 'MMMM yyyy');

  const allowedTypes = LEDGER_TABLES.filter((t) => (t === 'deductions' ? can(userRole, 'addDeduction') : can(userRole, 'addAdvanceOrLoan')));

  const lines = useMemo(
    () =>
      computePayroll({
        workers: workers.data ?? [],
        attendance: attendance.data ?? [],
        advances: advances.data ?? [],
        loans: loans.data ?? [],
        deductions: deductions.data ?? [],
      }),
    [workers.data, attendance.data, advances.data, loans.data, deductions.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => (type === 'all' || l.workerType === type) && (!q || l.name.toLowerCase().includes(q)));
  }, [lines, query, type]);

  const totals = useMemo(() => totalPayroll(filtered), [filtered]);
  const { sorted, sort, toggle } = useSort<PayrollLine>(filtered, {
    name: (l) => l.name,
    job: (l) => l.jobTitle,
    days: (l) => l.daysPresent,
    rate: (l) => l.rate,
    gross: (l) => l.gross,
    deductions: (l) => l.totalDeductions,
    net: (l) => l.net,
  }, { key: 'name', direction: 'asc' });

  const loading = workers.isLoading || attendance.isLoading;
  const failed = workers.error ?? attendance.error;

  function exportCsv() {
    const headers = isCeo
      ? ['Worker', 'Type', 'Site', 'Job', 'Rate', 'Days', 'Net pay']
      : ['Worker', 'Type', 'Site', 'Job', 'Rate', 'Days', 'Gross', 'SSNIT', 'Tax', 'Advances', 'Loans', 'Other deductions', 'Net pay', 'Account site', 'Account number'];
    const rows = sorted.map((l) =>
      isCeo
        ? [l.name, l.workerType, l.siteName, l.jobTitle, l.rate, l.fixed ? 'Fixed' : l.daysPresent, l.net.toFixed(2)]
        : [l.name, l.workerType, l.siteName, l.jobTitle, l.rate, l.fixed ? 'Fixed' : l.daysPresent, l.gross.toFixed(2), l.ssnit.toFixed(2), l.tax.toFixed(2), l.advances.toFixed(2), l.loans.toFixed(2), l.otherDeductions.toFixed(2), l.net.toFixed(2), l.accountSite, l.accountNumber],
    );
    downloadCsv(`payroll_${month}${inProgress ? '_provisional' : ''}.csv`, [headers, ...rows]);
    toast({ title: 'Exported', description: 'The salary schedule was saved as a CSV file.' });
  }

  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description={`Salary schedule and payroll entries for ${monthLabel}.`}
        actions={
          <>
            <MonthSelect value={month} onChange={(m) => { setMonth(m); setExpanded(new Set()); }} />
            <Button variant="outline" onClick={exportCsv} disabled={sorted.length === 0}>
              <Download /> Export
            </Button>
            {allowedTypes.length > 0 && (
              <Button onClick={() => setAddOpen(true)} data-testid="button-add-entry">
                <Plus /> Add entry
              </Button>
            )}
          </>
        }
      />

      {inProgress && (
        <div role="note" className="flex items-start gap-3 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">{monthLabel} is still in progress.</span> Days worked and deductions keep changing until the month closes, so treat these figures as provisional.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Workers" value={totals.workers} icon={Users} loading={loading} />
        <StatCard label={isCeo ? 'Gross pay' : 'Gross pay'} value={money(totals.gross)} icon={Wallet} loading={loading} />
        <StatCard label="Deductions" value={money(totals.totalDeductions)} hint={isCeo ? undefined : 'SSNIT, tax, advances, loans and other'} icon={ReceiptText} tone="warning" loading={loading} />
        <StatCard label="Net payable" value={money(totals.net)} icon={Landmark} tone="success" loading={loading} />
      </div>

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedule">Salary schedule</TabsTrigger>
          <TabsTrigger value="ledger">Advances &amp; deductions</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-0">
          <Card>
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
              <SearchInput value={query} onChange={setQuery} placeholder="Search workers" className="sm:w-72" />
              <Segmented
                label="Worker type"
                value={type}
                onChange={setType}
                options={[
                  { value: 'all', label: 'All', count: lines.length },
                  { value: 'casual', label: 'Casual', count: lines.filter((l) => l.workerType === 'casual').length },
                  { value: 'non_marking', label: 'Non-marking', count: lines.filter((l) => l.workerType === 'non_marking').length },
                ]}
              />
            </div>

            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : failed ? (
              <EmptyState icon={Wallet} title="Couldn't load payroll" description={errorMessage(failed)} action={<Button variant="outline" onClick={() => { workers.refetch(); attendance.refetch(); }}>Try again</Button>} />
            ) : sorted.length === 0 ? (
              <EmptyState icon={Users} title="No workers to show" description="Nobody matches these filters." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <SortHead label="Worker" column="name" sort={sort} onSort={toggle} />
                      <SortHead label="Job" column="job" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                      <SortHead label="Days" column="days" sort={sort} onSort={toggle} align="right" />
                      <SortHead label="Rate" column="rate" sort={sort} onSort={toggle} align="right" className="hidden sm:table-cell" />
                      {!isCeo && <SortHead label="Gross" column="gross" sort={sort} onSort={toggle} align="right" />}
                      {!isCeo && <SortHead label="Deductions" column="deductions" sort={sort} onSort={toggle} align="right" className="hidden sm:table-cell" />}
                      <SortHead label="Net pay" column="net" sort={sort} onSort={toggle} align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((l) => {
                      const open = expanded.has(l.workerId);
                      return (
                        <Fragment key={l.workerId}>
                          <TableRow className={cn(!isCeo && 'cursor-pointer')} onClick={() => !isCeo && toggleRow(l.workerId)} data-testid={`payroll-row-${l.workerId}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {!isCeo && <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />}
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{l.name || 'Unnamed worker'}</p>
                                  <p className="truncate text-xs text-muted-foreground">{l.siteName}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground md:table-cell">{l.jobTitle}</TableCell>
                            <TableCell className="num text-right">{l.fixed ? <span className="text-muted-foreground">Fixed</span> : l.daysPresent}</TableCell>
                            <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{money(l.rate)}</TableCell>
                            {!isCeo && <TableCell className="num text-right">{money(l.gross)}</TableCell>}
                            {!isCeo && <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{l.totalDeductions ? `-${money(l.totalDeductions)}` : money(0)}</TableCell>}
                            <TableCell className="num text-right font-semibold">
                              {money(l.net)}
                              {l.overdrawn && <Badge variant="warning" className="ml-2">Overdrawn</Badge>}
                            </TableCell>
                          </TableRow>
                          {open && !isCeo && (
                            <TableRow className="bg-alabaster hover:bg-alabaster">
                              <TableCell colSpan={7} className="py-4">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pl-6 text-sm sm:grid-cols-3 lg:grid-cols-6">
                                  <Breakdown label="SSNIT (5.5%)" value={money(l.ssnit)} />
                                  <Breakdown label="Income tax (10%)" value={money(l.tax)} />
                                  <Breakdown label="Advances" value={money(l.advances)} />
                                  <Breakdown label="Loans" value={money(l.loans)} />
                                  <Breakdown label="Other deductions" value={money(l.otherDeductions)} />
                                  <div className="col-span-2 sm:col-span-1">
                                    <dt className="text-xs text-muted-foreground">Type</dt>
                                    <dd className="mt-0.5"><WorkerTypeBadge type={l.workerType} /></dd>
                                  </div>
                                  <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                                    <dt className="text-xs text-muted-foreground">Pay into</dt>
                                    <dd className="num mt-0.5">{l.accountNumber !== '-' ? `${l.accountNumber} · ${l.accountSite}` : 'No account on file'}</dd>
                                  </div>
                                </dl>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-0">
          <LedgerPanel month={month} workerNames={new Map((workers.data ?? []).map((w) => [w.id, w.name || 'Unnamed worker']))} />
        </TabsContent>
      </Tabs>

      <AddEntryDialog open={addOpen} onOpenChange={setAddOpen} month={month} monthLabel={monthLabel} allowedTypes={allowedTypes} workers={workers.data ?? []} />
    </div>
  );
}

function Breakdown({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ Ledger
function LedgerPanel({ month, workerNames }: { month: string; workerNames: Map<string, string> }) {
  const [table, setTable] = useState<LedgerTable>('salary_advances');
  const advances = useLedger('salary_advances', month);
  const loans = useLedger('loans', month);
  const deductions = useLedger('deductions', month);
  const queries = { salary_advances: advances, loans, deductions };
  const active = queries[table];
  const rows = active.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Entry type"
          value={table}
          onChange={setTable}
          options={LEDGER_TABLES.map((t) => ({ value: t, label: LEDGER_LABEL[t].plural, count: queries[t].data?.length }))}
        />
        <p className="num text-sm text-muted-foreground">
          Total <span className="font-semibold text-foreground">{money(total)}</span>
        </p>
      </div>
      {active.isLoading ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={`No ${LEDGER_LABEL[table].plural.toLowerCase()} this month`} description="Entries you add will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHeadSimple>Date</SortableHeadSimple>
                <SortableHeadSimple>Worker</SortableHeadSimple>
                <SortableHeadSimple className="text-right">Amount</SortableHeadSimple>
                <SortableHeadSimple className="hidden sm:table-cell">Notes</SortableHeadSimple>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="num whitespace-nowrap text-muted-foreground">{formatDay(r.date, 'd MMM yyyy')}</TableCell>
                  <TableCell className="font-medium">{workerNames.get(r.worker_id) ?? 'Unknown worker'}</TableCell>
                  <TableCell className="num text-right">{money(r.amount)}</TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">{r.notes || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// Plain (non-sortable) header cell for the ledger, styled like the sortable ones.
function SortableHeadSimple({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('h-10 bg-alabaster px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground', className)}>{children}</th>;
}

// ------------------------------------------------------------------ Add entry
function AddEntryDialog({
  open,
  onOpenChange,
  month,
  monthLabel,
  allowedTypes,
  workers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  monthLabel: string;
  allowedTypes: LedgerTable[];
  workers: { id: string; name: string | null; site?: { site_name: string } | null }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && <AddEntryForm month={month} monthLabel={monthLabel} allowedTypes={allowedTypes} workers={workers} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddEntryForm({ month, monthLabel, allowedTypes, workers, onDone }: { month: string; monthLabel: string; allowedTypes: LedgerTable[]; workers: { id: string; name: string | null; site?: { site_name: string } | null }[]; onDone: () => void }) {
  const { toast } = useToast();
  const monthStart = `${month}-01`;
  const monthEnd = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd');
  const today = todayISO();

  const [table, setTable] = useState<LedgerTable>(allowedTypes[0]);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  // Keep the date inside the pay month so an entry's date and month never disagree.
  const [date, setDate] = useState(today >= monthStart && today <= monthEnd ? today : monthStart);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddLedgerEntry(table);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!workerId) return setError('Choose a worker.');
    if (!Number.isInteger(value) || value <= 0) return setError('Enter a whole-number amount above zero.');
    if (date < monthStart || date > monthEnd) return setError(`The date must fall in ${monthLabel}.`);
    setError(null);
    try {
      await add.mutateAsync({ workerId, amount: value, month, date, notes });
      const name = workers.find((w) => w.id === workerId)?.name || 'the worker';
      toast({ title: `${LEDGER_LABEL[table].singular} added`, description: `${money(value)} recorded for ${name}.` });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle>Add an entry</DialogTitle>
        <DialogDescription>Recorded against {monthLabel} pay.</DialogDescription>
      </DialogHeader>

      {allowedTypes.length > 1 && (
        <Field label="Type" htmlFor="entry-type">
          <Select value={table} onValueChange={(v) => setTable(v as LedgerTable)}>
            <SelectTrigger id="entry-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allowedTypes.map((t) => <SelectItem key={t} value={t}>{LEDGER_LABEL[t].singular}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Worker" htmlFor="entry-worker">
        <WorkerPicker id="entry-worker" workers={workers} value={workerId} onChange={setWorkerId} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount (₵)" htmlFor="entry-amount">
          <Input id="entry-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="num" />
        </Field>
        <Field label="Date" htmlFor="entry-date">
          <Input id="entry-date" type="date" value={date} min={monthStart} max={monthEnd} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="entry-notes" hint="Optional">
        <Textarea id="entry-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      {error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={add.isPending}>Cancel</Button>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Add {LEDGER_LABEL[table].singular.toLowerCase()}
        </Button>
      </DialogFooter>
    </form>
  );
}
