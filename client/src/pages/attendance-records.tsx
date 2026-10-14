import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock3, Coffee, HelpCircle, Users, XCircle } from 'lucide-react';
import { exportTable } from '@/lib/export';
import { ExportMenu, type ExportFormat } from '@/components/common/export-menu';
import { formatDay, formatTime, todayISO, workerTypeLabel } from '@/lib/format';
import { useSort } from '@/lib/use-sort';
import { errorMessage } from '@/lib/api/util';
import { useSites, useUsers } from '@/lib/api/reference';
import { useWorkers } from '@/lib/api/workers';
import { useAttendanceOn } from '@/lib/api/attendance';
import type { AttendanceRow, WorkerRow, WorkerType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { AttendanceBadge, WorkerTypeBadge } from '@/components/common/status-badge';
import { DateStepper, SearchInput, Segmented, SortHead } from '@/components/common/controls';

type StatusFilter = 'all' | 'Present' | 'Absent' | 'Leave' | 'Half Day';

interface Line extends AttendanceRow {
  worker?: WorkerRow;
  markedByName: string;
}

export default function AttendanceRecordsPage() {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState('');
  const [siteId, setSiteId] = useState('all');
  const [type, setType] = useState<'all' | WorkerType>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const sites = useSites();
  const users = useUsers();
  const workers = useWorkers();
  const attendance = useAttendanceOn(date);

  const workerById = useMemo(() => new Map((workers.data ?? []).map((w) => [w.id, w])), [workers.data]);
  const userName = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.full_name])), [users.data]);
  const records = attendance.data ?? [];

  const lines: Line[] = useMemo(
    () => records.map((r) => ({ ...r, worker: workerById.get(r.worker_id), markedByName: userName.get(r.marked_by) ?? '' })),
    [records, workerById, userName],
  );

  const totals = useMemo(() => {
    const c = { Present: 0, Absent: 0, Leave: 0, 'Half Day': 0 };
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);
  const notMarked = Math.max(0, (workers.data?.length ?? 0) - records.length);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter(
      (l) =>
        (status === 'all' || l.status === status) &&
        (type === 'all' || l.worker_type === type) &&
        (siteId === 'all' || l.worker?.site_id === siteId) &&
        (!q || (l.worker?.name ?? '').toLowerCase().includes(q)),
    );
  }, [lines, query, status, type, siteId]);

  const { sorted, sort, toggle } = useSort(
    filtered,
    {
      worker: (l) => l.worker?.name,
      site: (l) => l.worker?.site?.site_name,
      type: (l) => l.worker_type,
      status: (l) => l.status,
      time: (l) => l.timestamp,
      by: (l) => l.markedByName,
    },
    { key: 'time', direction: 'desc' },
  );

  const loading = attendance.isLoading || workers.isLoading;

  function exportRecords(format: ExportFormat) {
    return exportTable(format, {
      baseName: `attendance_${date}`,
      title: 'Attendance records',
      subtitle: formatDay(date),
      head: ['Date', 'Worker', 'Site', 'Type', 'Status', 'Marked at', 'Marked by'],
      body: sorted.map((l) => [date, l.worker?.name, l.worker?.site?.site_name, workerTypeLabel(l.worker_type), l.status, formatTime(l.timestamp), l.markedByName]),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance records"
        description="Who was marked on a given day, across every site. Read-only."
        actions={
          <>
            <DateStepper value={date} onChange={setDate} max={today} />
            <ExportMenu onExport={exportRecords} disabled={sorted.length === 0} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Present" value={totals.Present} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="Absent" value={totals.Absent} icon={XCircle} tone="danger" loading={loading} />
        <StatCard label="On leave" value={totals.Leave} icon={Coffee} tone="info" loading={loading} />
        <StatCard label="Half day" value={totals['Half Day']} icon={Clock3} tone="warning" loading={loading} />
        <StatCard label="Not marked yet" value={notMarked} hint={`of ${workers.data?.length ?? 0} workers`} icon={HelpCircle} loading={loading} className="col-span-2 md:col-span-1" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search workers" className="xl:w-64" data-testid="input-search-workers" />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All', count: records.length },
              { value: 'Present', label: 'Present', count: totals.Present },
              { value: 'Absent', label: 'Absent', count: totals.Absent },
              { value: 'Leave', label: 'Leave', count: totals.Leave },
              { value: 'Half Day', label: 'Half day', count: totals['Half Day'] },
            ]}
          />
          <div className="flex gap-2 xl:ml-auto">
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-full xl:w-48" aria-label="Site"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => setType(v as 'all' | WorkerType)}>
              <SelectTrigger className="w-full xl:w-40" aria-label="Worker type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="non_marking">Non-marking</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : attendance.isError ? (
          <EmptyState icon={Users} title="Couldn't load records" description={errorMessage(attendance.error)} action={<Button variant="outline" onClick={() => attendance.refetch()}>Try again</Button>} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={records.length === 0 ? 'Nothing recorded for this day' : 'No records match those filters'}
            description={records.length === 0 ? `No attendance has been marked for ${formatDay(date)} yet.` : 'Try clearing a filter or the search.'}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortHead label="Worker" column="worker" sort={sort} onSort={toggle} />
                    <SortHead label="Site" column="site" sort={sort} onSort={toggle} />
                    <SortHead label="Type" column="type" sort={sort} onSort={toggle} />
                    <SortHead label="Status" column="status" sort={sort} onSort={toggle} />
                    <SortHead label="Marked by" column="by" sort={sort} onSort={toggle} />
                    <SortHead label="Time" column="time" sort={sort} onSort={toggle} align="right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((l) => (
                    <TableRow key={l.id} data-testid={`attendance-record-${l.id}`}>
                      <TableCell className="font-medium">{l.worker?.name || 'Unknown worker'}</TableCell>
                      <TableCell className="text-muted-foreground">{l.worker?.site?.site_name || '-'}</TableCell>
                      <TableCell><WorkerTypeBadge type={l.worker_type} /></TableCell>
                      <TableCell><AttendanceBadge status={l.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{l.markedByName || '-'}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{formatTime(l.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {sorted.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.worker?.name || 'Unknown worker'}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {l.worker?.site?.site_name || 'No site'} · {formatTime(l.timestamp)}
                    </p>
                  </div>
                  <AttendanceBadge status={l.status} />
                </li>
              ))}
            </ul>
            <p className="num border-t border-border px-4 py-3 text-sm text-muted-foreground">
              {sorted.length} record{sorted.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
