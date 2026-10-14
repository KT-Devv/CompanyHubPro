import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { changedFields, useAuditLog, type AuditFilter } from '@/lib/api/audit';
import { useUsers } from '@/lib/api/reference';
import { errorMessage } from '@/lib/api/util';
import { exportTable } from '@/lib/export';
import { formatDateTime } from '@/lib/format';
import type { AuditRow } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ExportMenu } from '@/components/common/export-menu';
import { Field } from '@/components/common/controls';

const PAGE = 100;
const ANY = 'any';

// Plain names for the tables the audit trigger watches.
const TABLE_LABEL: Record<string, string> = {
  workers: 'Workers',
  worker_transfers: 'Transfers',
  attendance: 'Attendance',
  salary_advances: 'Advances',
  loans: 'Loans',
  deductions: 'Deductions',
  salary_schedules: 'Salary schedules',
  inventory: 'Inventory',
  goods_log: 'Goods movements',
  invoices: 'Invoices',
  users: 'Accounts',
  account_invites: 'Account invitations',
  payroll_periods: 'Payroll months',
  payroll_lines: 'Payroll lines',
  payroll_reopens: 'Payroll reopenings',
  app_settings: 'Settings',
  sites: 'Sites',
  stores: 'Stores',
  portfolios: 'Portfolios',
  positions: 'Positions',
};
const tableLabel = (t: string) => TABLE_LABEL[t] ?? t;

const ACTION_BADGE = { INSERT: { variant: 'success', label: 'Added' }, UPDATE: { variant: 'info', label: 'Changed' }, DELETE: { variant: 'danger', label: 'Removed' } } as const;

const prettyKey = (k: string) => k.replace(/_/g, ' ');
function prettyValue(v: unknown): string {
  if (v == null) return 'none';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// A short, human description of what a row records.
function summarise(row: AuditRow): string {
  const data = (row.action === 'DELETE' ? row.old_data : row.new_data) ?? {};
  const name = (data.name ?? data.item_name ?? data.full_name ?? data.site_name ?? data.month ?? data.key) as string | undefined;
  if (row.action === 'UPDATE') {
    const keys = changedFields(row).map((c) => prettyKey(c.key));
    return `${name ? `${name}: ` : ''}${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ` and ${keys.length - 4} more` : ''}` || 'No visible change';
  }
  return name ? String(name) : row.row_id ? `Record ${row.row_id.slice(0, 8)}` : '';
}

export default function AuditPage() {
  const [table, setTable] = useState(ANY);
  const [action, setAction] = useState(ANY);
  const [userId, setUserId] = useState(ANY);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const filter: AuditFilter = useMemo(
    () => ({
      table: table === ANY ? undefined : table,
      action: action === ANY ? undefined : action,
      userId: userId === ANY ? undefined : userId,
      from: from || undefined,
      to: to || undefined,
    }),
    [table, action, userId, from, to],
  );
  const log = useAuditLog(filter, limit);
  const users = useUsers();
  const nameOf = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.full_name])), [users.data]);
  const who = (id: string | null) => (id ? nameOf.get(id) ?? 'Former user' : 'System');

  const rows = log.data ?? [];

  function resetPaging<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setLimit(PAGE); setOpen(null); };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="A tamper-proof record of who added, changed or removed what. It is written by the database itself, so it cannot be skipped or edited from the app."
        actions={
          <ExportMenu
            disabled={rows.length === 0}
            onExport={(format) =>
              exportTable(format, {
                baseName: 'audit-log',
                title: 'Audit log',
                subtitle: `${rows.length} most recent entries${from || to ? `, ${from || 'start'} to ${to || 'today'}` : ''}`,
                head: ['When', 'Who', 'Area', 'Action', 'Details'],
                body: rows.map((r) => [formatDateTime(r.changed_at, 'yyyy-MM-dd HH:mm:ss'), who(r.changed_by), tableLabel(r.table_name), ACTION_BADGE[r.action].label, summarise(r)]),
                landscape: true,
              })
            }
          />
        }
      />

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Area">
          <Select value={table} onValueChange={resetPaging(setTable)}>
            <SelectTrigger aria-label="Area"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All areas</SelectItem>
              {Object.entries(TABLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Action">
          <Select value={action} onValueChange={resetPaging(setAction)}>
            <SelectTrigger aria-label="Action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any action</SelectItem>
              {Object.entries(ACTION_BADGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Person">
          <Select value={userId} onValueChange={resetPaging(setUserId)}>
            <SelectTrigger aria-label="Person"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Anyone</SelectItem>
              {(users.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="From" htmlFor="audit-from">
          <Input id="audit-from" type="date" value={from} max={to || undefined} onChange={(e) => resetPaging(setFrom)(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <Input id="audit-to" type="date" value={to} min={from || undefined} onChange={(e) => resetPaging(setTo)(e.target.value)} />
        </Field>
      </Card>

      <Card className="overflow-hidden">
        {log.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : log.isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load the audit log" description={errorMessage(log.error)} action={<Button variant="outline" onClick={() => log.refetch()}>Try again</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing recorded" description="No changes match these filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = open === r.id;
                  const meta = ACTION_BADGE[r.action];
                  return (
                    <Fragment key={r.id}>
                      <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)} data-testid={`audit-row-${r.id}`}>
                        <TableCell className="w-8 pr-0">
                          <button type="button" aria-label={isOpen ? 'Hide details' : 'Show details'} aria-expanded={isOpen} className="text-muted-foreground" onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : r.id); }}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-sm">{formatDateTime(r.changed_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">{who(r.changed_by)}</TableCell>
                        <TableCell className="whitespace-nowrap">{tableLabel(r.table_name)}</TableCell>
                        <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                        <TableCell className="max-w-md truncate text-muted-foreground">{summarise(r)}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-alabaster/60 hover:bg-alabaster/60">
                          <TableCell />
                          <TableCell colSpan={5}>
                            <dl className="grid gap-x-6 gap-y-1 py-1 text-sm sm:grid-cols-[minmax(8rem,12rem)_1fr_1fr]">
                              {r.action === 'UPDATE' && (
                                <>
                                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Field</dt>
                                  <dd className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Before</dd>
                                  <dd className="text-xs font-medium uppercase tracking-wider text-muted-foreground">After</dd>
                                </>
                              )}
                              {changedFields(r).map((c) => (
                                <Fragment key={c.key}>
                                  <dt className="font-medium capitalize">{prettyKey(c.key)}</dt>
                                  <dd className="break-all text-muted-foreground">{r.action === 'INSERT' ? '' : prettyValue(c.before)}</dd>
                                  <dd className="break-all">{r.action === 'DELETE' ? '' : prettyValue(c.after)}</dd>
                                </Fragment>
                              ))}
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {rows.length >= limit && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} disabled={log.isFetching} data-testid="button-load-more">Show older entries</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
