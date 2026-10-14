import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ALL_ROLES, ROLE_LABEL, roleLabel, type UserRole } from '@/lib/roles';
import { useAccounts, useInviteAccount, useUpdateAccount } from '@/lib/api/accounts';
import { useSites, useStores } from '@/lib/api/reference';
import { errorMessage } from '@/lib/api/util';
import { exportTable } from '@/lib/export';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ExportMenu } from '@/components/common/export-menu';
import { Field, SearchInput } from '@/components/common/controls';

const NONE = 'none';

// Roles tied to one place: a supervisor works at a site, a store manager runs a store.
const needsSite = (role: string) => role === 'supervisor';
const needsStore = (role: string) => role === 'store_manager';

interface FormState {
  email: string;
  fullName: string;
  role: string;
  siteId: string;
  storeId: string;
  isActive: boolean;
}

function RoleFields({ form, set, assignableRoles, sites, stores }: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  assignableRoles: readonly UserRole[];
  sites: { id: string; site_name: string }[];
  stores: { id: string; name: string }[];
}) {
  return (
    <>
      <Field label="Role" htmlFor="acct-role">
        <Select value={form.role} onValueChange={(role) => set({ role, siteId: needsSite(role) ? form.siteId : NONE, storeId: needsStore(role) ? form.storeId : NONE })}>
          <SelectTrigger id="acct-role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
          <SelectContent>
            {assignableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {needsSite(form.role) && (
        <Field label="Site" htmlFor="acct-site" hint="A supervisor only sees and marks workers at this site.">
          <Select value={form.siteId} onValueChange={(siteId) => set({ siteId })}>
            <SelectTrigger id="acct-site"><SelectValue placeholder="Choose a site" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No site</SelectItem>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {needsStore(form.role) && (
        <Field label="Store" htmlFor="acct-store" hint="A store manager only sees and moves stock in this store.">
          <Select value={form.storeId} onValueChange={(storeId) => set({ storeId })}>
            <SelectTrigger id="acct-store"><SelectValue placeholder="Choose a store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No store</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}

export default function AccountsPage() {
  const { userRole, userId } = useAuth();
  const { toast } = useToast();
  const accounts = useAccounts();
  const sites = useSites();
  const stores = useStores();
  const update = useUpdateAccount();
  const invite = useInviteAccount();

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState<FormState>({ email: '', fullName: '', role: 'supervisor', siteId: NONE, storeId: NONE, isActive: true });
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  // Only the CEO may create or promote another CEO (the database refuses anyone else).
  const assignableRoles = useMemo(() => ALL_ROLES.filter((r) => r !== 'ceo' || userRole === 'ceo'), [userRole]);
  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.site_name])), [sites.data]);
  const storeName = useMemo(() => new Map((stores.data ?? []).map((s) => [s.id, s.name])), [stores.data]);

  const all = accounts.data ?? [];
  const visible = all.filter((a) => {
    const q = query.trim().toLowerCase();
    return !q || a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || roleLabel(a.role).toLowerCase().includes(q);
  });
  const place = (a: UserProfile) => (a.site_id ? siteName.get(a.site_id) : a.store_id ? storeName.get(a.store_id) : '') ?? '';

  function openEdit(a: UserProfile) {
    setForm({ email: a.email, fullName: a.full_name, role: a.role, siteId: a.site_id ?? NONE, storeId: a.store_id ?? NONE, isActive: a.is_active });
    setEditing(a);
  }
  function openInvite() {
    setForm({ email: '', fullName: '', role: 'supervisor', siteId: NONE, storeId: NONE, isActive: true });
    setInviting(true);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await update.mutateAsync({
        userId: editing.id,
        role: form.role,
        siteId: needsSite(form.role) && form.siteId !== NONE ? form.siteId : null,
        storeId: needsStore(form.role) && form.storeId !== NONE ? form.storeId : null,
        isActive: form.isActive,
        activeChanged: form.isActive !== editing.is_active,
      });
      toast({ title: 'Account updated', description: `${editing.full_name} is now ${roleLabel(form.role)}${form.isActive ? '' : ' and switched off'}.` });
      setEditing(null);
    } catch (err) {
      toast({ title: 'Could not update the account', description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
        siteId: needsSite(form.role) && form.siteId !== NONE ? form.siteId : null,
        storeId: needsStore(form.role) && form.storeId !== NONE ? form.storeId : null,
      });
      toast({ title: 'Invitation sent', description: `${form.email.trim()} will get an email to choose a password.` });
      setInviting(false);
    } catch (err) {
      toast({ title: 'Could not invite this person', description: err instanceof Error ? err.message : errorMessage(err), variant: 'destructive' });
    }
  }

  const inviteValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.fullName.trim().length > 1 && (!needsSite(form.role) || form.siteId !== NONE) && (!needsStore(form.role) || form.storeId !== NONE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Who can sign in, and what each person can see and do. Switching an account off cuts its access straight away."
        actions={
          <>
            <ExportMenu
              disabled={all.length === 0}
              onExport={(format) =>
                exportTable(format, {
                  baseName: 'accounts',
                  title: 'Accounts',
                  head: ['Name', 'Email', 'Role', 'Site / store', 'Status'],
                  body: visible.map((a) => [a.full_name, a.email, roleLabel(a.role), place(a), a.is_active ? 'Active' : 'Switched off']),
                })
              }
            />
            <Button onClick={openInvite} data-testid="button-invite"><UserPlus /> Invite someone</Button>
          </>
        }
      />

      <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or role" className="sm:w-80" data-testid="input-search-accounts" />

      <Card className="overflow-hidden">
        {accounts.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : accounts.isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load accounts" description={errorMessage(accounts.error)} action={<Button variant="outline" onClick={() => accounts.refetch()}>Try again</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Users} title="No accounts found" description="Try a different search." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Site / store</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <TableRow key={a.id} data-testid={`account-row-${a.id}`}>
                  <TableCell>
                    <p className="font-medium">{a.full_name}{a.id === userId && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</p>
                    <p className="text-sm text-muted-foreground">{a.email}</p>
                  </TableCell>
                  <TableCell>{roleLabel(a.role)}</TableCell>
                  <TableCell className="text-muted-foreground">{place(a) || '-'}</TableCell>
                  <TableCell>{a.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Switched off</Badge>}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label={`Edit ${a.full_name}`} data-testid={`button-edit-account-${a.id}`}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.full_name}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RoleFields form={form} set={patch} assignableRoles={editing?.role === 'ceo' ? ALL_ROLES : assignableRoles} sites={sites.data ?? []} stores={stores.data ?? []} />
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Account active</span>
                <span className="block text-xs text-muted-foreground">
                  {editing?.id === userId ? 'You cannot switch off your own account.' : 'Switched-off people cannot sign in or see any data.'}
                </span>
              </span>
              <Switch checked={form.isActive} onCheckedChange={(isActive) => patch({ isActive })} disabled={editing?.id === userId} aria-label="Account active" data-testid="switch-active" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={update.isPending || (needsSite(form.role) && form.siteId === NONE) || (needsStore(form.role) && form.storeId === NONE)} data-testid="button-save-account">
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent className="max-w-md">
          <form onSubmit={sendInvite} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>They get an email to choose their own password. You never see or set it.</DialogDescription>
            </DialogHeader>
            <Field label="Full name" htmlFor="invite-name">
              <Input id="invite-name" value={form.fullName} onChange={(e) => patch({ fullName: e.target.value })} autoComplete="off" data-testid="input-invite-name" />
            </Field>
            <Field label="Email" htmlFor="invite-email">
              <Input id="invite-email" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} autoComplete="off" data-testid="input-invite-email" />
            </Field>
            <RoleFields form={form} set={patch} assignableRoles={assignableRoles} sites={sites.data ?? []} stores={stores.data ?? []} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setInviting(false)}>Cancel</Button>
              <Button type="submit" disabled={!inviteValid || invite.isPending} data-testid="button-send-invite">
                {invite.isPending && <Loader2 className="animate-spin" aria-hidden />} Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
