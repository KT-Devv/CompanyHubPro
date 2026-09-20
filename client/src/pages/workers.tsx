import { useMemo, useState } from 'react';
import { Download, Loader2, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { downloadCsv } from '@/lib/csv';
import { formatDay, money, todayISO, workerTypeLabel } from '@/lib/format';
import { useSort } from '@/lib/use-sort';
import { errorMessage } from '@/lib/api/util';
import { usePortfolios, usePositions, useSites } from '@/lib/api/reference';
import { useDeleteWorker, useSaveWorker, useWorkers, type WorkerPayload } from '@/lib/api/workers';
import type { WorkerRow, WorkerType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { WorkerTypeBadge } from '@/components/common/status-badge';
import { Field, Segmented, SearchInput, SortHead } from '@/components/common/controls';

const PAGE_SIZE = 50;

function jobTitle(w: WorkerRow) {
  return (w.worker_type === 'casual' ? w.portfolios?.portfolio_name : w.positions?.position_name) || '-';
}

function rateLabel(w: WorkerRow) {
  if (w.worker_type === 'casual') return w.portfolios?.rate != null ? `${money(w.portfolios.rate)} / day` : '-';
  return w.positions?.rate != null ? `${money(w.positions.rate)} / month` : '-';
}

// ------------------------------------------------------------------ Page
export default function WorkersPage() {
  const { userRole } = useAuth();
  const canEdit = can(userRole, 'editWorkers');
  const { toast } = useToast();

  const workers = useWorkers();
  const sites = useSites();
  const remove = useDeleteWorker();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | WorkerType>('all');
  const [siteId, setSiteId] = useState('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [viewing, setViewing] = useState<WorkerRow | null>(null);
  const [editing, setEditing] = useState<WorkerRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WorkerRow | null>(null);

  const all = workers.data ?? [];
  const counts = useMemo(
    () => ({ all: all.length, casual: all.filter((w) => w.worker_type === 'casual').length, non_marking: all.filter((w) => w.worker_type === 'non_marking').length }),
    [all],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (w) =>
        (type === 'all' || w.worker_type === type) &&
        (siteId === 'all' || w.site_id === siteId) &&
        (!q || (w.name ?? '').toLowerCase().includes(q) || (w.phone_number ?? '').includes(q) || (w.national_id ?? '').toLowerCase().includes(q)),
    );
  }, [all, query, type, siteId]);

  const { sorted, sort, toggle } = useSort(
    filtered,
    {
      name: (w) => w.name,
      job: jobTitle,
      site: (w) => w.site?.site_name,
      phone: (w) => w.phone_number,
    },
    { key: 'name', direction: 'asc' },
  );
  const shown = sorted.slice(0, visible);

  function exportCsv() {
    downloadCsv(`workers_${todayISO()}.csv`, [
      ['Name', 'Type', 'Job', 'Rate', 'Site', 'Phone', 'National ID', 'Date of birth', 'Employed since', 'Hometown', 'Current location', 'Contact person', 'Contact phone', 'Relation', 'Account site', 'Account number'],
      ...sorted.map((w) => [
        w.name, workerTypeLabel(w.worker_type), jobTitle(w), rateLabel(w), w.site?.site_name, w.phone_number, w.national_id, w.dob, w.date_of_employment,
        w.hometown, w.current_location, w.contact_person, w.cp_phone, w.cp_relation, w.account_site?.site_name, w.account_number,
      ]),
    ]);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({ title: 'Worker deleted', description: `${deleting.name || 'The worker'} was removed.` });
      setDeleting(null);
      setViewing(null);
    } catch (err) {
      toast({ title: 'Could not delete', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workers"
        description={canEdit ? 'Everyone on the payroll. Add, update or remove people here.' : 'Everyone on the payroll. Search, filter and open a profile for the full details.'}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={sorted.length === 0}>
              <Download /> Export
            </Button>
            {canEdit && (
              <Button onClick={() => setEditing('new')} data-testid="button-add-worker">
                <Plus /> Add worker
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setVisible(PAGE_SIZE); }} placeholder="Search name, phone or ID" className="lg:w-80" data-testid="input-search-workers" />
          <Segmented
            label="Worker type"
            value={type}
            onChange={(v) => { setType(v); setVisible(PAGE_SIZE); }}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'casual', label: 'Casual', count: counts.casual },
              { value: 'non_marking', label: 'Non-marking', count: counts.non_marking },
            ]}
          />
          <Select value={siteId} onValueChange={(v) => { setSiteId(v); setVisible(PAGE_SIZE); }}>
            <SelectTrigger className="lg:ml-auto lg:w-52" aria-label="Site">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.site_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {workers.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : workers.isError ? (
          <EmptyState icon={Users} title="Couldn't load workers" description={errorMessage(workers.error)} action={<Button variant="outline" onClick={() => workers.refetch()}>Try again</Button>} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Users}
            title={all.length === 0 ? 'No workers yet' : 'No workers match those filters'}
            description={all.length === 0 ? 'Add your first worker to get started.' : 'Try a different search or clear a filter.'}
            action={all.length === 0 && canEdit ? <Button onClick={() => setEditing('new')}><Plus /> Add worker</Button> : undefined}
          />
        ) : (
          <>
            {/* Wide screens: a table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortHead label="Name" column="name" sort={sort} onSort={toggle} />
                    <SortHead label="Job" column="job" sort={sort} onSort={toggle} />
                    <SortHead label="Site" column="site" sort={sort} onSort={toggle} />
                    <SortHead label="Phone" column="phone" sort={sort} onSort={toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((w) => (
                    <TableRow key={w.id} className="cursor-pointer" onClick={() => setViewing(w)} data-testid={`worker-row-${w.id}`}>
                      <TableCell>
                        <button className="flex items-center gap-2.5 text-left font-medium outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); setViewing(w); }}>
                          {w.name || 'Unnamed worker'}
                          <WorkerTypeBadge type={w.worker_type} />
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{jobTitle(w)}</TableCell>
                      <TableCell className="text-muted-foreground">{w.site?.site_name || '-'}</TableCell>
                      <TableCell className="num text-muted-foreground">{w.phone_number || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Phones: cards */}
            <ul className="divide-y divide-border md:hidden">
              {shown.map((w) => (
                <li key={w.id}>
                  <button className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-alabaster" onClick={() => setViewing(w)}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{w.name || 'Unnamed worker'}</span>
                      <WorkerTypeBadge type={w.worker_type} />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {jobTitle(w)} · {w.site?.site_name || 'No site'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span className="num">
                Showing {shown.length} of {sorted.length}
              </span>
              {shown.length < sorted.length && (
                <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Show more
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      <WorkerDetails
        worker={viewing}
        onClose={() => setViewing(null)}
        canEdit={canEdit}
        onEdit={(w) => { setViewing(null); setEditing(w); }}
        onDelete={(w) => setDeleting(w)}
      />
      <WorkerForm editing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name || 'this worker'}?`}
        description="This permanently removes the worker. Workers with attendance or pay records can't be deleted."
        confirmLabel="Delete worker"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Details drawer
function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || '-'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">{children}</dl>
    </section>
  );
}

function WorkerDetails({ worker, onClose, canEdit, onEdit, onDelete }: { worker: WorkerRow | null; onClose: () => void; canEdit: boolean; onEdit: (w: WorkerRow) => void; onDelete: (w: WorkerRow) => void }) {
  return (
    <Sheet open={!!worker} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {worker && (
          <>
            <SheetHeader className="space-y-3 border-b border-border bg-alabaster p-6 text-left">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <UserRound className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <SheetTitle className="text-xl">{worker.name || 'Unnamed worker'}</SheetTitle>
                <SheetDescription className="mt-1 flex items-center gap-2">
                  <WorkerTypeBadge type={worker.worker_type} />
                  <span>{worker.site?.site_name || 'No site assigned'}</span>
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="scroll-quiet flex-1 space-y-8 overflow-y-auto p-6">
              <Section title="Job & pay">
                <Detail label={worker.worker_type === 'casual' ? 'Portfolio' : 'Position'} value={jobTitle(worker)} />
                <Detail label="Rate" value={rateLabel(worker)} />
                <Detail label="Employed since" value={worker.date_of_employment ? formatDay(worker.date_of_employment, 'd MMM yyyy') : null} />
              </Section>
              <Section title="Personal">
                <Detail label="Phone" value={worker.phone_number} />
                <Detail label="National ID" value={worker.national_id} />
                <Detail label="Date of birth" value={worker.dob ? formatDay(worker.dob, 'd MMM yyyy') : null} />
                <Detail label="Hometown" value={worker.hometown} />
                <Detail label="Current location" value={worker.current_location} />
              </Section>
              <Section title="Emergency contact">
                <Detail label="Name" value={worker.contact_person} />
                <Detail label="Phone" value={worker.cp_phone} />
                <Detail label="Relationship" value={worker.cp_relation} />
              </Section>
              {worker.worker_type === 'casual' && (
                <Section title="Bank account">
                  <Detail label="Account site" value={worker.account_site?.site_name} />
                  <Detail label="Account number" value={worker.account_number} />
                </Section>
              )}
            </div>

            {canEdit && (
              <SheetFooter className="flex-row justify-between gap-2 border-t border-border bg-alabaster p-4 sm:justify-between">
                <Button variant="outline" className="text-danger hover:text-danger" onClick={() => onDelete(worker)}>
                  <Trash2 /> Delete
                </Button>
                <Button onClick={() => onEdit(worker)} data-testid={`button-edit-${worker.id}`}>
                  <Pencil /> Edit
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Add / edit drawer
interface FormState {
  name: string;
  worker_type: WorkerType;
  portfolio_id: string;
  position_id: string;
  site_id: string;
  phone_number: string;
  national_id: string;
  dob: string;
  date_of_employment: string;
  contact_person: string;
  cp_phone: string;
  cp_relation: string;
  hometown: string;
  current_location: string;
  account_location: string;
  account_number: string;
}

function toForm(w: WorkerRow | null): FormState {
  return {
    name: w?.name ?? '',
    worker_type: w?.worker_type ?? 'casual',
    portfolio_id: w?.portfolio_id ?? '',
    position_id: w?.position_id ?? '',
    site_id: w?.site_id ?? '',
    phone_number: w?.phone_number ?? '',
    national_id: w?.national_id ?? '',
    dob: w?.dob ?? '',
    date_of_employment: w?.date_of_employment ?? '',
    contact_person: w?.contact_person ?? '',
    cp_phone: w?.cp_phone ?? '',
    cp_relation: w?.cp_relation ?? '',
    hometown: w?.hometown ?? '',
    current_location: w?.current_location ?? '',
    account_location: w?.account_location ?? '',
    account_number: w?.account_number ?? '',
  };
}

function WorkerForm({ editing, onClose }: { editing: WorkerRow | 'new' | null; onClose: () => void }) {
  // Key on the target so the form state resets whenever a different worker opens.
  const target = editing === 'new' ? null : editing;
  return (
    <Sheet open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {editing !== null && <WorkerFormBody key={target?.id ?? 'new'} worker={target} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function WorkerFormBody({ worker, onDone }: { worker: WorkerRow | null; onDone: () => void }) {
  const { toast } = useToast();
  const save = useSaveWorker();
  const sites = useSites();
  const portfolios = usePortfolios();
  const positions = usePositions();
  const [form, setForm] = useState<FormState>(() => toForm(worker));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const casual = form.worker_type === 'casual';

  function validate() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Enter the worker\'s full name.';
    if (!form.phone_number.trim()) next.phone_number = 'Enter a phone number.';
    if (!form.national_id.trim()) next.national_id = 'Enter a national ID.';
    if (casual && !form.portfolio_id) next.portfolio_id = 'Choose a portfolio.';
    if (!casual && !form.position_id) next.position_id = 'Choose a position.';
    if (!form.site_id) next.site_id = 'Choose a site.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const values: WorkerPayload = {
      name: form.name.trim(),
      worker_type: form.worker_type,
      portfolio_id: casual ? form.portfolio_id || null : null,
      position_id: casual ? null : form.position_id || null,
      site_id: form.site_id || null,
      phone_number: form.phone_number.trim(),
      national_id: form.national_id.trim(),
      dob: form.dob || null,
      date_of_employment: form.date_of_employment || null,
      contact_person: form.contact_person.trim(),
      cp_phone: form.cp_phone.trim(),
      cp_relation: form.cp_relation.trim(),
      hometown: form.hometown.trim(),
      current_location: form.current_location.trim(),
      // Only casual workers are paid into a site account
      account_location: casual ? form.account_location || null : null,
      account_number: casual ? form.account_number.trim() || null : null,
    };
    try {
      await save.mutateAsync({ id: worker?.id, values });
      toast({ title: worker ? 'Worker updated' : 'Worker added', description: `${values.name} was saved.` });
      onDone();
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    }
  }

  const text = (key: keyof FormState, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Field label={label} htmlFor={`f-${key}`} error={errors[key]}>
      <Input id={`f-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value as never)} disabled={save.isPending} {...extra} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
      <SheetHeader className="border-b border-border bg-alabaster p-6 text-left">
        <SheetTitle>{worker ? 'Edit worker' : 'Add worker'}</SheetTitle>
        <SheetDescription>{worker ? 'Update the details below.' : 'Fill in the details for the new worker.'}</SheetDescription>
      </SheetHeader>

      <div className="scroll-quiet flex-1 space-y-8 overflow-y-auto p-6">
        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Job</h3>
          {text('name', 'Full name', { autoFocus: true })}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Worker type" htmlFor="f-type">
              <Select value={form.worker_type} onValueChange={(v) => setForm((f) => ({ ...f, worker_type: v as WorkerType, portfolio_id: '', position_id: '' }))}>
                <SelectTrigger id="f-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual (paid per day)</SelectItem>
                  <SelectItem value="non_marking">Non-marking (monthly)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Site" htmlFor="f-site" error={errors.site_id}>
              <Select value={form.site_id} onValueChange={(v) => set('site_id', v)}>
                <SelectTrigger id="f-site"><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>
                  {sites.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {casual ? (
            <Field label="Portfolio" htmlFor="f-portfolio" error={errors.portfolio_id} hint="Sets the daily rate.">
              <Select value={form.portfolio_id} onValueChange={(v) => set('portfolio_id', v)}>
                <SelectTrigger id="f-portfolio"><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                <SelectContent>
                  {portfolios.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.portfolio_name} · {money(p.rate)}/day</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Position" htmlFor="f-position" error={errors.position_id} hint="Sets the monthly salary.">
              <Select value={form.position_id} onValueChange={(v) => set('position_id', v)}>
                <SelectTrigger id="f-position"><SelectValue placeholder="Select position" /></SelectTrigger>
                <SelectContent>
                  {positions.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.position_name}{p.rate != null ? ` · ${money(p.rate)}/month` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {text('date_of_employment', 'Date of employment', { type: 'date', max: todayISO() })}
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Personal</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('phone_number', 'Phone number', { type: 'tel', inputMode: 'tel' })}
            {text('national_id', 'National ID')}
            {text('dob', 'Date of birth', { type: 'date', max: todayISO() })}
            {text('hometown', 'Hometown')}
          </div>
          {text('current_location', 'Current location')}
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Emergency contact</h3>
          {text('contact_person', 'Contact person')}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('cp_phone', 'Contact phone', { type: 'tel', inputMode: 'tel' })}
            {text('cp_relation', 'Relationship')}
          </div>
        </section>

        {casual && (
          <section className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bank account</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account site" htmlFor="f-acct-site">
                <Select value={form.account_location} onValueChange={(v) => set('account_location', v)}>
                  <SelectTrigger id="f-acct-site"><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {sites.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {text('account_number', 'Account number')}
            </div>
          </section>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t border-border bg-alabaster p-4">
        <Button type="button" variant="ghost" onClick={onDone} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {worker ? 'Save changes' : 'Add worker'}
        </Button>
      </SheetFooter>
    </form>
  );
}
