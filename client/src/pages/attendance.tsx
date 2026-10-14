import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Coffee, CloudOff, Loader2, RotateCw, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { formatDay, todayISO } from '@/lib/format';
import { errorMessage } from '@/lib/api/util';
import { useWorkers, searchWorkersElsewhere } from '@/lib/api/workers';
import { useAttendanceOn, useMarkAttendance } from '@/lib/api/attendance';
import { removeMark, retryMark } from '@/lib/offline/queue';
import { useOfflineQueue } from '@/lib/offline/use-offline';
import type { AttendanceRow, AttendanceStatus, WorkerRow } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { AttendanceBadge, WorkerTypeBadge } from '@/components/common/status-badge';
import { DateStepper, SearchInput, Segmented } from '@/components/common/controls';

type Filter = 'all' | 'unmarked' | AttendanceStatus;

const ACTIONS: { status: Extract<AttendanceStatus, 'Present' | 'Absent' | 'Leave'>; icon: typeof CheckCircle2; tone: string }[] = [
  { status: 'Present', icon: CheckCircle2, tone: 'text-success hover:bg-success-soft' },
  { status: 'Absent', icon: XCircle, tone: 'text-danger hover:bg-danger-soft' },
  { status: 'Leave', icon: Coffee, tone: 'text-info hover:bg-info-soft' },
];

function jobTitle(w: WorkerRow) {
  return (w.worker_type === 'casual' ? w.portfolios?.portfolio_name : w.positions?.position_name) || '';
}

export default function AttendancePage() {
  const { userRole, userId, userSiteId } = useAuth();
  const { toast } = useToast();
  const isSupervisor = userRole === 'supervisor';
  const isSecretary = userRole === 'secretary';
  const canHalfDay = can(userRole, 'markHalfDay');
  const today = todayISO();

  const [pickedDate, setDate] = useState(today);
  // Everyone who marks here marks today and nothing else (the database enforces
  // this too), so there is no date to choose. Only the CEO and HR may back-fill.
  const canBackfill = can(userRole, 'backfillAttendance');
  const date = canBackfill ? pickedDate : today;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pending, setPending] = useState<{ worker: WorkerRow; status: AttendanceStatus } | null>(null);
  const [halfDayFor, setHalfDayFor] = useState<{ worker: WorkerRow; record: AttendanceRow } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [elsewhereOpen, setElsewhereOpen] = useState(false);

  // A supervisor sees their own site, a secretary the office staff. A
  // supervisor with no site must see nobody (not everybody).
  const workers = useWorkers({
    siteId: isSupervisor ? userSiteId : null,
    type: isSecretary ? 'non_marking' : undefined,
    enabled: !isSupervisor || !!userSiteId,
  });
  const attendance = useAttendanceOn(date);
  const { markOne, markMany, markHalfDay } = useMarkAttendance();

  // Marks made on this phone with no signal that haven't reached the server yet
  // are shown as already marked (so nobody is marked twice), with a "waiting" tag.
  const queue = useOfflineQueue();
  const queued = useMemo(
    () => new Map(queue.filter((m) => m.date === date && m.markedBy === userId).map((m) => [m.workerId, m])),
    [queue, date, userId],
  );
  const records = useMemo(() => {
    const map = new Map((attendance.data ?? []).map((r) => [r.worker_id, r]));
    queued.forEach((m, workerId) => {
      if (!map.has(workerId)) map.set(workerId, { id: `queued-${m.key}`, worker_id: workerId, date: m.date, status: m.status, marked_by: m.markedBy, worker_type: m.workerType } as AttendanceRow);
    });
    return map;
  }, [attendance.data, queued]);
  const all = workers.data ?? [];

  const counts = useMemo(() => {
    const c = { all: all.length, unmarked: 0, Present: 0, Absent: 0, Leave: 0, 'Half Day': 0 } as Record<Filter, number>;
    for (const w of all) {
      const r = records.get(w.id);
      if (!r) c.unmarked++;
      else c[r.status]++;
    }
    return c;
  }, [all, records]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((w) => {
      const r = records.get(w.id);
      const matchesFilter = filter === 'all' || (filter === 'unmarked' ? !r : r?.status === filter);
      return matchesFilter && (!q || (w.name ?? '').toLowerCase().includes(q));
    });
  }, [all, records, filter, query]);

  const markedCount = all.length - counts.unmarked;
  const pct = all.length ? Math.round((markedCount / all.length) * 100) : 0;
  const selectable = visible.filter((w) => !records.has(w.id));
  const allSelected = selectable.length > 0 && selectable.every((w) => selected.has(w.id));

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmSingle() {
    if (!pending || !userId) return;
    const { worker, status } = pending;
    try {
      const outcome = await markOne.mutateAsync({ workerId: worker.id, workerName: worker.name, workerType: worker.worker_type ?? 'casual', date, status, markedBy: userId });
      toast(outcome.queued
        ? { title: 'Saved on this phone', description: `${worker.name || 'Worker'} marked ${status.toLowerCase()}. It will be sent when you're back online.` }
        : { title: 'Attendance recorded', description: `${worker.name || 'Worker'} marked ${status.toLowerCase()}.` });
    } catch (err) {
      toast({ title: 'Could not record attendance', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setPending(null);
    }
  }

  async function confirmBulk() {
    if (!userId) return;
    const targets = all.filter((w) => selected.has(w.id) && !records.has(w.id));
    try {
      const { saved, queued: kept } = await markMany.mutateAsync(
        targets.map((w) => ({ workerId: w.id, workerName: w.name, workerType: w.worker_type ?? 'casual', date, status: 'Present' as const, markedBy: userId })),
      );
      if (kept) {
        toast({ title: 'Saved on this phone', description: `${kept} worker${kept === 1 ? '' : 's'} marked present. They will be sent when you're back online.` });
      } else {
        const skipped = targets.length - saved.length;
        toast({
          title: 'Attendance recorded',
          description: `${saved.length} worker${saved.length === 1 ? '' : 's'} marked present${skipped ? `, ${skipped} had already been marked by someone else` : ''}.`,
        });
      }
      setSelected(new Set());
    } catch (err) {
      toast({ title: 'Could not record attendance', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBulkOpen(false);
    }
  }

  async function confirmHalfDay() {
    if (!halfDayFor) return;
    try {
      await markHalfDay.mutateAsync(halfDayFor.record.id);
      toast({ title: 'Updated', description: `${halfDayFor.worker.name || 'Worker'} is now marked for a half day.` });
    } catch (err) {
      toast({ title: 'Could not update', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setHalfDayFor(null);
    }
  }

  if (isSupervisor && !userSiteId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mark attendance" />
        <Card>
          <EmptyState icon={AlertTriangle} title="You're not assigned to a site" description="Ask an administrator to assign a site to your profile. Until then there are no workers to mark." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Mark attendance"
        description={isSupervisor ? 'Record who is on site today. A marked day is locked, so double-check before you confirm.' : isSecretary ? 'Record attendance for office staff today.' : canBackfill ? 'Record attendance for any worker, today or an earlier day you missed. A marked day is locked, so double-check before you confirm.' : 'Record attendance for today.'}
        actions={
          <>
            {!canBackfill ? (
              <span className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium" data-testid="fixed-date">Today, {formatDay(today, 'd MMM yyyy')}</span>
            ) : (
              <DateStepper value={date} onChange={(d) => { setDate(d); setSelected(new Set()); }} max={today} />
            )}
            {isSupervisor && (
              <Button variant="outline" onClick={() => setElsewhereOpen(true)} data-testid="button-cross-site">
                <UserPlus /> Other site
              </Button>
            )}
          </>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{formatDay(date)}</p>
            <p className="num mt-0.5 text-lg font-semibold">
              {markedCount} <span className="font-normal text-muted-foreground">of {all.length} marked</span>
            </p>
          </div>
          <span className="num text-2xl font-semibold text-foreground/80">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-3 h-2 bg-pearl" aria-label="Share of workers marked" />
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search workers" className="lg:w-72" data-testid="input-search-workers" />
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'unmarked', label: 'Unmarked', count: counts.unmarked },
            { value: 'Present', label: 'Present', count: counts.Present },
            { value: 'Absent', label: 'Absent', count: counts.Absent },
            { value: 'Leave', label: 'Leave', count: counts.Leave },
            { value: 'Half Day', label: 'Half day', count: counts['Half Day'] },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {workers.isLoading || attendance.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : workers.isError || attendance.isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load the list" description={errorMessage(workers.error ?? attendance.error)} action={<Button variant="outline" onClick={() => { workers.refetch(); attendance.refetch(); }}>Try again</Button>} />
        ) : all.length === 0 ? (
          <EmptyState icon={Users} title="No workers to show" description={isSupervisor ? 'Your site has no workers assigned yet.' : 'There are no workers in your list yet.'} />
        ) : visible.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing matches" description="Try another filter or search." />
        ) : (
          <>
            {selectable.length > 0 && (
              <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-alabaster px-4 py-2.5 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(on) =>
                    setSelected(
                      on
                        ? new Set(Array.from(selected).concat(selectable.map((w) => w.id)))
                        : new Set(Array.from(selected).filter((id) => !selectable.some((w) => w.id === id))),
                    )
                  }
                  aria-label="Select all unmarked workers"
                />
                Select all unmarked ({selectable.length})
              </label>
            )}
            <ul className="divide-y divide-border">
              {visible.map((worker) => {
                const record = records.get(worker.id);
                return (
                  <li key={worker.id} className={cn('flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center', record && 'bg-alabaster/60')} data-testid={`worker-row-${worker.id}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Checkbox
                        checked={selected.has(worker.id)}
                        disabled={!!record}
                        onCheckedChange={(on) => toggleSelected(worker.id, !!on)}
                        aria-label={`Select ${worker.name}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{worker.name || 'Unnamed worker'}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <WorkerTypeBadge type={worker.worker_type} />
                          {jobTitle(worker) && <span>{jobTitle(worker)}</span>}
                          {!isSupervisor && worker.site?.site_name && <span>· {worker.site.site_name}</span>}
                        </p>
                      </div>
                    </div>

                    {record ? (
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <AttendanceBadge status={record.status} />
                        {queued.has(worker.id) && (
                          queued.get(worker.id)!.state === 'failed' ? (
                            <>
                              <span className="flex items-center gap-1 text-xs text-danger" title={queued.get(worker.id)!.error}>
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Not saved: {queued.get(worker.id)!.error}
                              </span>
                              <Button variant="outline" size="sm" onClick={() => void retryMark(queued.get(worker.id)!.key)}>
                                <RotateCw /> Retry
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => void removeMark(queued.get(worker.id)!.key)}>
                                <Trash2 /> Discard
                              </Button>
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`queued-${worker.id}`}>
                              <CloudOff className="h-3.5 w-3.5" aria-hidden /> Waiting to sync
                            </span>
                          )
                        )}
                        {canHalfDay && record.status === 'Present' && !queued.has(worker.id) && (
                          <Button variant="outline" size="sm" onClick={() => setHalfDayFor({ worker, record })} data-testid={`button-half-day-${worker.id}`}>
                            <Clock3 /> Half day
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:flex">
                        {ACTIONS.map(({ status, icon: Icon, tone }) => (
                          <Button key={status} variant="outline" className={cn('sm:min-w-[6.5rem]', tone)} onClick={() => setPending({ worker, status })} data-testid={`button-${status.toLowerCase()}-${worker.id}`}>
                            <Icon /> {status}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-4 sm:left-auto sm:right-6 sm:w-auto sm:rounded-xl sm:border">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 sm:gap-6">
            <span className="num text-sm font-medium">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button onClick={() => setBulkOpen(true)} data-testid="button-mark-selected">
                <CheckCircle2 /> Mark present
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Mark ${pending?.worker.name || 'worker'} ${pending?.status.toLowerCase() ?? ''}?`}
        description={<>For {formatDay(date)}. Once recorded this can't be undone.</>}
        confirmLabel={`Mark ${pending?.status.toLowerCase() ?? ''}`}
        loading={markOne.isPending}
        onConfirm={confirmSingle}
      />
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Mark ${selected.size} worker${selected.size === 1 ? '' : 's'} present?`}
        description={<>For {formatDay(date)}. Once recorded this can't be undone.</>}
        confirmLabel="Mark present"
        loading={markMany.isPending}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={!!halfDayFor}
        onOpenChange={(open) => !open && setHalfDayFor(null)}
        title={`Change ${halfDayFor?.worker.name || 'worker'} to a half day?`}
        description="This adjusts the record from a full day to a half day (counted as 0.5 days for pay)."
        confirmLabel="Change to half day"
        loading={markHalfDay.isPending}
        onConfirm={confirmHalfDay}
      />

      {isSupervisor && (
        <ElsewhereDialog
          open={elsewhereOpen}
          onOpenChange={setElsewhereOpen}
          siteId={userSiteId}
          records={records}
          date={date}
          onPick={(worker, status) => setPending({ worker, status })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Mark someone from another site
function ElsewhereDialog({
  open,
  onOpenChange,
  siteId,
  records,
  date,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
  records: Map<string, AttendanceRow>;
  date: string;
  onPick: (worker: WorkerRow, status: AttendanceStatus) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [results, setResults] = useState<WorkerRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSearching(true);
    try {
      setResults(await searchWorkersElsewhere(name, siteId));
    } catch (err) {
      toast({ title: 'Search failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setName(''); setResults(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark a worker from another site</DialogTitle>
          <DialogDescription>Search by name, then record their attendance for {formatDay(date)}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={search} className="flex gap-2">
          <SearchInput value={name} onChange={setName} placeholder="Worker name" className="flex-1" autoFocus data-testid="input-cross-site-search" />
          <Button type="submit" disabled={searching || !name.trim()}>
            {searching && <Loader2 className="animate-spin" aria-hidden />} Search
          </Button>
        </form>
        <div className="scroll-quiet max-h-80 overflow-y-auto">
          {results && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No workers from other sites match "{name}".</p>}
          <ul className="space-y-2">
            {results?.map((w) => {
              const record = records.get(w.id);
              return (
                <li key={w.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{w.name}</p>
                      <p className="text-sm text-muted-foreground">{w.site?.site_name || 'No site'}</p>
                    </div>
                    {record && <AttendanceBadge status={record.status} />}
                  </div>
                  {!record && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {ACTIONS.map(({ status, icon: Icon, tone }) => (
                        <Button key={status} variant="outline" size="sm" className={tone} onClick={() => { onOpenChange(false); onPick(w, status); }}>
                          <Icon /> {status}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
