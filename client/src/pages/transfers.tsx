import { useMemo, useState } from 'react';
import { ArrowRight, ArrowRightLeft, History, Info, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { formatDay, todayISO } from '@/lib/format';
import { errorMessage } from '@/lib/api/util';
import { useSites, useUsers } from '@/lib/api/reference';
import { useTransfers, useTransferWorker, useWorkers } from '@/lib/api/workers';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { Field, WorkerPicker } from '@/components/common/controls';

export default function TransfersPage() {
  const { userRole } = useAuth();
  const canTransfer = can(userRole, 'transferWorkers');

  return (
    <div className="space-y-6">
      <PageHeader title="Transfers" description="Move a worker to another site, and see every transfer that has been made." />

      {!canTransfer && (
        <div role="note" className="flex items-start gap-3 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>You can review transfers here, but only HR, the System Manager and the CEO can make them.</p>
        </div>
      )}

      <div className={canTransfer ? 'grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]' : ''}>
        {canTransfer && <TransferForm />}
        <TransferHistory />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Form
function TransferForm() {
  const { userId } = useAuth();
  const { toast } = useToast();
  const workers = useWorkers();
  const sites = useSites();
  const transfer = useTransferWorker();

  const [workerId, setWorkerId] = useState<string | null>(null);
  const [toSite, setToSite] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [accountSite, setAccountSite] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const worker = workers.data?.find((w) => w.id === workerId);
  const casual = worker?.worker_type === 'casual';
  const fromName = worker?.site?.site_name;

  function reset() {
    setWorkerId(null);
    setToSite('');
    setNotes('');
    setAccountSite('');
    setAccountNumber('');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!worker) return setError('Choose a worker.');
    if (!toSite) return setError('Choose the destination site.');
    setError(null);
    try {
      await transfer.mutateAsync({
        worker,
        toSiteId: toSite,
        effectiveDate: date,
        notes,
        newAccountNumber: accountNumber,
        newAccountLocation: accountSite || null,
        createdBy: userId,
      });
      toast({ title: 'Worker transferred', description: `${worker.name} moved to ${sites.data?.find((s) => s.id === toSite)?.site_name}.` });
      reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>New transfer</CardTitle>
        <CardDescription>Casual workers are paid into a site account, so their account details must be replaced.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Worker" htmlFor="tr-worker" hint={worker ? `Currently at ${fromName ?? 'no site'}` : undefined}>
            <WorkerPicker id="tr-worker" workers={workers.data ?? []} value={workerId} onChange={(id) => { setWorkerId(id); setAccountSite(''); setAccountNumber(''); if (id) setToSite(''); }} />
          </Field>

          <Field label="Move to" htmlFor="tr-site">
            <Select value={toSite} onValueChange={setToSite} disabled={!worker}>
              <SelectTrigger id="tr-site"><SelectValue placeholder={worker ? 'Select destination' : 'Choose a worker first'} /></SelectTrigger>
              <SelectContent>
                {sites.data?.filter((s) => s.id !== worker?.site_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {casual && (
            <div className="space-y-4 rounded-xl border border-border bg-alabaster p-4">
              <p className="text-sm font-medium">New bank account</p>
              <Field label="Account site" htmlFor="tr-acct-site">
                <Select value={accountSite} onValueChange={setAccountSite}>
                  <SelectTrigger id="tr-acct-site" className="bg-card"><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Account number" htmlFor="tr-acct-no" hint={worker?.account_number ? `Replaces ${worker.account_number}` : undefined}>
                <Input id="tr-acct-no" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="num bg-card" />
              </Field>
            </div>
          )}

          <Field label="Effective date" htmlFor="tr-date">
            <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="tr-notes" hint="Optional">
            <Input id="tr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this worker moving?" />
          </Field>

          {error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={transfer.isPending || !worker || !toSite} className="flex-1">
              {transfer.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRightLeft />} Transfer worker
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={transfer.isPending}>Reset</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ History
function TransferHistory() {
  const transfers = useTransfers();
  const workers = useWorkers();
  const sites = useSites();
  const users = useUsers();

  const workerName = useMemo(() => new Map((workers.data ?? []).map((w) => [w.id, w.name || 'Unnamed worker'])), [workers.data]);
  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.site_name])), [sites.data]);
  const userName = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.full_name])), [users.data]);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Transfer history</CardTitle>
        <CardDescription>The 50 most recent transfers</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {transfers.isLoading ? (
          <div className="space-y-2 p-5 pt-0">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : transfers.isError ? (
          <EmptyState icon={History} title="Couldn't load the history" description={errorMessage(transfers.error)} action={<Button variant="outline" onClick={() => transfers.refetch()}>Try again</Button>} />
        ) : (transfers.data?.length ?? 0) === 0 ? (
          <EmptyState icon={History} title="No transfers yet" description="Transfers you make will be listed here." />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {transfers.data!.map((t) => (
              <li key={t.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{workerName.get(t.worker_id) ?? 'Unknown worker'}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                      {t.from_site_id ? siteName.get(t.from_site_id) ?? 'Unknown site' : 'No site'}
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      <span className="text-foreground">{t.to_site_id ? siteName.get(t.to_site_id) ?? 'Unknown site' : 'No site'}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm">{formatDay(t.effective_date, 'd MMM yyyy')}</p>
                    {t.cleared_account && <Badge variant="outline" className="mt-1">Account reset</Badge>}
                  </div>
                </div>
                {(t.notes || t.created_by) && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t.notes && <span>"{t.notes}"</span>}
                    {t.notes && t.created_by && ' · '}
                    {t.created_by && <span>by {userName.get(t.created_by) ?? 'unknown'}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
