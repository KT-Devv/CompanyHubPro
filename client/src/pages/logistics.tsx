import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Boxes, Clock3, Inbox, Loader2, PackageCheck, PackagePlus, Send, TrendingDown, Truck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { formatDateTime, whole } from '@/lib/format';
import { useSort } from '@/lib/use-sort';
import { errorMessage } from '@/lib/api/util';
import { useStores } from '@/lib/api/reference';
import {
  LOW_STOCK_THRESHOLD,
  useAddStock,
  useGoodsLogs,
  useIncomingLogs,
  useInventory,
  useReceiveGoods,
  useReceiveUnexpected,
  useSendGoods,
} from '@/lib/api/logistics';
import type { GoodsLogRow, InventoryRow, Store } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { LogStatusBadge, StockBadge } from '@/components/common/status-badge';
import { Field, SearchInput, SortHead } from '@/components/common/controls';

type Dialogs = 'add' | 'send' | 'unlisted' | null;

export default function LogisticsPage() {
  const { userRole, userStoreId } = useAuth();
  const storeScoped = userRole === 'store_manager';
  const canManage = can(userRole, 'manageStock');
  const scope = storeScoped ? userStoreId : null;
  const enabled = !storeScoped || !!userStoreId;

  const stores = useStores();
  const inventory = useInventory(scope, enabled);
  const logs = useGoodsLogs(scope, enabled);
  const incoming = useIncomingLogs(scope, enabled);

  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [receiving, setReceiving] = useState<GoodsLogRow | null>(null);

  const myStore = stores.data?.find((s) => s.id === userStoreId);
  const items = inventory.data ?? [];
  const low = items.filter((i) => i.quantity < LOW_STOCK_THRESHOLD);
  const units = items.reduce((sum, i) => sum + i.quantity, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (storeFilter === 'all' || i.store_id === storeFilter) && (!q || i.item_name.toLowerCase().includes(q)));
  }, [items, query, storeFilter]);

  const { sorted, sort, toggle } = useSort<InventoryRow>(filtered, {
    item: (i) => i.item_name,
    store: (i) => i.stores?.name,
    quantity: (i) => i.quantity,
    updated: (i) => i.last_updated,
  }, { key: 'item', direction: 'asc' });

  if (storeScoped && !userStoreId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Logistics" />
        <Card>
          <EmptyState icon={AlertTriangle} title="You're not assigned to a store" description="Ask an administrator to assign a store to your profile. Until then there is no inventory to show." />
        </Card>
      </div>
    );
  }

  const loading = inventory.isLoading || stores.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title={storeScoped ? myStore?.name ?? 'Your store' : 'Logistics'}
        description={storeScoped ? `Inventory and shipments for ${myStore?.location ?? 'your store'}.` : 'Stock levels and goods movement across every store.'}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setDialog('add')} data-testid="button-add-inventory">
                <PackagePlus /> Add stock
              </Button>
              <Button onClick={() => setDialog('send')} data-testid="button-add-goods-log">
                <Send /> Send goods
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Items tracked" value={whole(items.length)} icon={Boxes} loading={loading} />
        <StatCard label="Units in stock" value={whole(units)} icon={PackageCheck} loading={loading} />
        <StatCard label="Running low" value={whole(low.length)} hint={`Under ${LOW_STOCK_THRESHOLD} units`} icon={TrendingDown} tone={low.length ? 'warning' : 'neutral'} loading={loading} />
        <StatCard label="Shipments in transit" value={whole(incoming.data?.length ?? 0)} icon={Clock3} tone={incoming.data?.length ? 'info' : 'neutral'} loading={loading} />
      </div>

      {!storeScoped && (stores.data?.length ?? 0) > 0 && (
        <div className="scroll-quiet -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          <StoreChip label="All stores" detail={`${whole(units)} units`} active={storeFilter === 'all'} onClick={() => setStoreFilter('all')} />
          {stores.data!.map((s) => (
            <StoreChip
              key={s.id}
              label={s.name}
              detail={`${whole(items.filter((i) => i.store_id === s.id).reduce((n, i) => n + i.quantity, 0))} units`}
              active={storeFilter === s.id}
              onClick={() => setStoreFilter(s.id)}
            />
          ))}
        </div>
      )}

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
          <TabsTrigger value="incoming" data-testid="tab-incoming">
            Incoming
            {(incoming.data?.length ?? 0) > 0 && <span className="num ml-1.5 rounded-full bg-info-soft px-1.5 text-[11px] leading-4 text-info">{incoming.data!.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-goods">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-0">
          <Card>
            <div className="border-b border-border p-4">
              <SearchInput value={query} onChange={setQuery} placeholder="Search items" className="sm:w-72" data-testid="input-search-inventory" />
            </div>
            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : inventory.isError ? (
              <EmptyState icon={Boxes} title="Couldn't load inventory" description={errorMessage(inventory.error)} action={<Button variant="outline" onClick={() => inventory.refetch()}>Try again</Button>} />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title={items.length === 0 ? 'No stock recorded yet' : 'No items match'}
                description={items.length === 0 ? 'Add the first item to start tracking stock.' : 'Try a different search or store.'}
                action={items.length === 0 && canManage ? <Button onClick={() => setDialog('add')}><PackagePlus /> Add stock</Button> : undefined}
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <SortHead label="Item" column="item" sort={sort} onSort={toggle} />
                        {!storeScoped && <SortHead label="Store" column="store" sort={sort} onSort={toggle} />}
                        <SortHead label="Quantity" column="quantity" sort={sort} onSort={toggle} align="right" />
                        <TableHead>Status</TableHead>
                        <SortHead label="Updated" column="updated" sort={sort} onSort={toggle} align="right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((item) => (
                        <TableRow key={item.id} data-testid={`inventory-item-${item.id}`}>
                          <TableCell>
                            <p className="font-medium">{item.item_name}</p>
                            {item.remarks && <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={item.remarks}>{item.remarks}</p>}
                          </TableCell>
                          {!storeScoped && <TableCell className="text-muted-foreground">{item.stores?.name}</TableCell>}
                          <TableCell className="num text-right font-medium">{whole(item.quantity)}</TableCell>
                          <TableCell><StockBadge quantity={item.quantity} threshold={LOW_STOCK_THRESHOLD} /></TableCell>
                          <TableCell className="num whitespace-nowrap text-right text-muted-foreground">{formatDateTime(item.last_updated, 'd MMM, HH:mm')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="divide-y divide-border md:hidden">
                  {sorted.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.item_name}</p>
                        <p className="truncate text-sm text-muted-foreground">{storeScoped ? formatDateTime(item.last_updated, 'd MMM, HH:mm') : item.stores?.name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="num font-semibold">{whole(item.quantity)}</span>
                        <StockBadge quantity={item.quantity} threshold={LOW_STOCK_THRESHOLD} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="incoming" className="mt-0">
          <Card>
            {incoming.isLoading ? (
              <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (incoming.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Inbox} title="Nothing on the way" description="Shipments sent to your store will show up here until you receive them." />
            ) : (
              <ul className="divide-y divide-border">
                {incoming.data!.map((log) => (
                  <li key={log.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info sm:flex"><Truck className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{log.inventory?.item_name ?? 'Item'}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        {log.from_store?.name ?? 'Unknown'} <ArrowRight className="h-3 w-3" aria-hidden /> {log.to_store?.name ?? 'Unknown'}
                        <span>· sent {formatDateTime(log.date, 'd MMM, HH:mm')}</span>
                      </p>
                      {log.remarks && <p className="mt-1 text-sm text-muted-foreground">"{log.remarks}"</p>}
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="num text-lg font-semibold">{whole(log.quantity)}</p>
                        <p className="text-xs text-muted-foreground">expected</p>
                      </div>
                      {canManage && <Button onClick={() => setReceiving(log)} data-testid={`button-receive-${log.id}`}><PackageCheck /> Receive</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canManage && !storeScoped && (
              <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                Goods turned up that nobody sent?{' '}
                <button className="font-medium text-foreground underline underline-offset-4" onClick={() => setDialog('unlisted')}>Record an unlisted receipt</button>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-0">
          <Card>
            {logs.isLoading ? (
              <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (logs.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Truck} title="No movements yet" description="Sent and received goods are listed here, newest first." />
            ) : (
              <ul className="divide-y divide-border">
                {logs.data!.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid={`goods-log-${log.id}`}>
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', log.type === 'sent' ? 'bg-ivory text-foreground/70' : 'bg-success-soft text-success')}>
                      {log.type === 'sent' ? <Send className="h-4 w-4" aria-hidden /> : <PackageCheck className="h-4 w-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{log.inventory?.item_name ?? 'Item'}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {log.type === 'sent' ? `${log.from_store?.name ?? 'Unknown'} → ${log.to_store?.name ?? 'Unknown'}` : `Received at ${log.to_store?.name ?? 'Unknown'}`}
                        {log.remarks ? ` · ${log.remarks}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <LogStatusBadge status={log.status} />
                      <div className="w-20 text-right">
                        <p className={cn('num font-semibold', log.status === 'error' && 'text-danger')}>{whole(log.quantity)}</p>
                        <p className="num text-xs text-muted-foreground">{formatDateTime(log.date, 'd MMM, HH:mm')}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AddStockDialog open={dialog === 'add'} onClose={() => setDialog(null)} stores={stores.data ?? []} fixedStoreId={storeScoped ? userStoreId : null} inventory={items} />
      <SendDialog open={dialog === 'send'} onClose={() => setDialog(null)} stores={stores.data ?? []} fixedStoreId={storeScoped ? userStoreId : null} inventory={items} />
      <ReceiveDialog log={receiving} onClose={() => setReceiving(null)} />
      <UnlistedDialog open={dialog === 'unlisted'} onClose={() => setDialog(null)} stores={stores.data ?? []} inventory={items} />
    </div>
  );
}

function StoreChip({ label, detail, active, onClick }: { label: string; detail: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-w-[9.5rem] shrink-0 rounded-xl border px-4 py-3 text-left transition-colors',
        active ? 'border-foreground/20 bg-card shadow-sm' : 'border-card-border bg-alabaster hover:bg-card',
      )}
    >
      <p className="truncate text-sm font-medium">{label}</p>
      <p className="num mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

// ------------------------------------------------------------------ Shared bits
function StoreSelect({ id, value, onChange, stores, exclude, disabled }: { id: string; value: string; onChange: (id: string) => void; stores: Store[]; exclude?: string; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}><SelectValue placeholder="Select store" /></SelectTrigger>
      <SelectContent>
        {stores.filter((s) => s.id !== exclude).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FormError({ children }: { children: string | null }) {
  return children ? <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{children}</p> : null;
}

// ------------------------------------------------------------------ Add stock
function AddStockDialog({ open, onClose, stores, fixedStoreId, inventory }: { open: boolean; onClose: () => void; stores: Store[]; fixedStoreId: string | null; inventory: InventoryRow[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <AddStockForm onClose={onClose} stores={stores} fixedStoreId={fixedStoreId} inventory={inventory} />}</DialogContent>
    </Dialog>
  );
}

function AddStockForm({ onClose, stores, fixedStoreId, inventory }: { onClose: () => void; stores: Store[]; fixedStoreId: string | null; inventory: InventoryRow[] }) {
  const { toast } = useToast();
  const add = useAddStock();
  const [storeId, setStoreId] = useState(fixedStoreId ?? '');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => Array.from(new Set(inventory.map((i) => i.item_name))).sort(), [inventory]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!storeId) return setError('Choose a store.');
    if (!itemName.trim()) return setError('Enter an item name.');
    if (!Number.isInteger(qty) || qty < 0) return setError('Quantity must be zero or a positive whole number.');
    setError(null);
    try {
      const result = await add.mutateAsync({ storeId, itemName, quantity: qty, remarks });
      toast({ title: 'Stock updated', description: `${itemName.trim()}: ${result.created ? 'added to' : 'topped up in'} ${stores.find((s) => s.id === storeId)?.name ?? 'the store'}.` });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle>Add stock</DialogTitle>
        <DialogDescription>Adding an item that's already in the store tops up its quantity.</DialogDescription>
      </DialogHeader>
      {!fixedStoreId && (
        <Field label="Store" htmlFor="add-store"><StoreSelect id="add-store" value={storeId} onChange={setStoreId} stores={stores} /></Field>
      )}
      <Field label="Item name" htmlFor="add-item">
        <Input id="add-item" list="known-items" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Cement bags" autoFocus data-testid="input-item-name" />
        <datalist id="known-items">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <Field label="Quantity" htmlFor="add-qty">
        <Input id="add-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="num" data-testid="input-quantity" />
      </Field>
      <Field label="Remarks" htmlFor="add-remarks" hint="Optional. Kept when the item is first created.">
        <Textarea id="add-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      </Field>
      <FormError>{error}</FormError>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={add.isPending}>Cancel</Button>
        <Button type="submit" disabled={add.isPending} data-testid="button-submit-inventory">{add.isPending && <Loader2 className="animate-spin" aria-hidden />} Add stock</Button>
      </DialogFooter>
    </form>
  );
}

// ------------------------------------------------------------------ Send goods
function SendDialog({ open, onClose, stores, fixedStoreId, inventory }: { open: boolean; onClose: () => void; stores: Store[]; fixedStoreId: string | null; inventory: InventoryRow[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <SendForm onClose={onClose} stores={stores} fixedStoreId={fixedStoreId} inventory={inventory} />}</DialogContent>
    </Dialog>
  );
}

function SendForm({ onClose, stores, fixedStoreId, inventory }: { onClose: () => void; stores: Store[]; fixedStoreId: string | null; inventory: InventoryRow[] }) {
  const { toast } = useToast();
  const send = useSendGoods();
  const [fromId, setFromId] = useState(fixedStoreId ?? '');
  const [toId, setToId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const available = inventory.filter((i) => i.store_id === fromId && i.quantity > 0);
  const item = available.find((i) => i.id === itemId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!fromId) return setError('Choose where the goods are coming from.');
    if (!toId) return setError('Choose where they are going.');
    if (!item) return setError('Choose an item to send.');
    if (!Number.isInteger(qty) || qty <= 0) return setError('Quantity must be a positive whole number.');
    if (qty > item.quantity) return setError(`Only ${item.quantity} in stock.`);
    setError(null);
    try {
      await send.mutateAsync({ itemId: item.id, fromStoreId: fromId, toStoreId: toId, quantity: qty, remarks });
      toast({ title: 'Shipment sent', description: `${qty} × ${item.item_name} is on its way to ${stores.find((s) => s.id === toId)?.name}.` });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle>Send goods</DialogTitle>
        <DialogDescription>Stock leaves the sending store now and stays "in transit" until the receiving store confirms it.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="send-from">
          <StoreSelect id="send-from" value={fromId} onChange={(id) => { setFromId(id); setItemId(''); if (id === toId) setToId(''); }} stores={stores} disabled={!!fixedStoreId} />
        </Field>
        <Field label="To" htmlFor="send-to">
          <StoreSelect id="send-to" value={toId} onChange={setToId} stores={stores} exclude={fromId} />
        </Field>
      </div>
      <Field label="Item" htmlFor="send-item" hint={item ? `${item.quantity} in stock` : fromId && available.length === 0 ? 'This store has nothing in stock to send.' : undefined}>
        <Select value={itemId} onValueChange={setItemId} disabled={!fromId}>
          <SelectTrigger id="send-item" data-testid="select-log-item"><SelectValue placeholder={fromId ? 'Select item' : 'Choose a store first'} /></SelectTrigger>
          <SelectContent>{available.map((i) => <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.quantity})</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Quantity" htmlFor="send-qty">
        <Input id="send-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="num" data-testid="input-log-quantity" />
      </Field>
      <Field label="Remarks" htmlFor="send-remarks" hint="Optional">
        <Textarea id="send-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      </Field>
      <FormError>{error}</FormError>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={send.isPending}>Cancel</Button>
        <Button type="submit" disabled={send.isPending} data-testid="button-submit-goods-log">{send.isPending && <Loader2 className="animate-spin" aria-hidden />} Send goods</Button>
      </DialogFooter>
    </form>
  );
}

// ------------------------------------------------------------------ Receive a shipment
function ReceiveDialog({ log, onClose }: { log: GoodsLogRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{log && <ReceiveForm key={log.id} log={log} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ log, onClose }: { log: GoodsLogRow; onClose: () => void }) {
  const { toast } = useToast();
  const receive = useReceiveGoods();
  const [quantity, setQuantity] = useState(String(log.quantity));
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const counted = Number(quantity);
  const mismatch = quantity !== '' && counted !== log.quantity;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!log.to_store?.id && !log.store_to) return setError('This shipment has no destination store.');
    if (!Number.isInteger(counted) || counted <= 0) return setError('Enter the quantity you actually received.');
    if (!log.inventory?.item_name) return setError('Could not determine which item this shipment is for.');
    setError(null);
    try {
      const result = await receive.mutateAsync({
        pendingLog: { id: log.id, item_id: log.item_id, store_from: log.store_from, quantity: log.quantity },
        receivingStoreId: (log.store_to ?? log.to_store?.id) as string,
        itemName: log.inventory.item_name,
        quantity: counted,
        remarks,
      });
      if (result === 'matched') toast({ title: 'Shipment received', description: `${counted} × ${log.inventory.item_name} added to stock.` });
      else toast({ title: 'Received with a mismatch', description: `Expected ${log.quantity}, counted ${counted}. Flagged for review.`, variant: 'destructive' });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle>Receive shipment</DialogTitle>
        <DialogDescription>{log.inventory?.item_name} from {log.from_store?.name ?? 'another store'}, sent {formatDateTime(log.date, 'd MMM, HH:mm')}.</DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border border-border bg-alabaster px-4 py-3 text-sm">
        Expected <span className="num font-semibold">{log.quantity}</span>
      </div>
      <Field label="Quantity received" htmlFor="recv-qty" hint="Count what actually arrived.">
        <Input id="recv-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))} className="num" autoFocus />
      </Field>
      {mismatch && (
        <p className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          This differs from the {log.quantity} sent. The counted stock is still added, and the shipment is flagged for review.
        </p>
      )}
      <Field label="Remarks" htmlFor="recv-remarks" hint="Optional. Explain any difference.">
        <Textarea id="recv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      </Field>
      <FormError>{error}</FormError>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={receive.isPending}>Cancel</Button>
        <Button type="submit" disabled={receive.isPending}>{receive.isPending && <Loader2 className="animate-spin" aria-hidden />} Confirm receipt</Button>
      </DialogFooter>
    </form>
  );
}

// ------------------------------------------------------------------ Receipt with no matching shipment
function UnlistedDialog({ open, onClose, stores, inventory }: { open: boolean; onClose: () => void; stores: Store[]; inventory: InventoryRow[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <UnlistedForm onClose={onClose} stores={stores} inventory={inventory} />}</DialogContent>
    </Dialog>
  );
}

function UnlistedForm({ onClose, stores, inventory }: { onClose: () => void; stores: Store[]; inventory: InventoryRow[] }) {
  const { toast } = useToast();
  const receive = useReceiveUnexpected();
  const [storeId, setStoreId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const item = inventory.find((i) => i.id === itemId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!storeId) return setError('Choose the receiving store.');
    if (!item) return setError('Choose the item.');
    if (!Number.isInteger(qty) || qty <= 0) return setError('Quantity must be a positive whole number.');
    setError(null);
    try {
      await receive.mutateAsync({ itemId: item.id, itemName: item.item_name, receivingStoreId: storeId, quantity: qty, remarks });
      toast({ title: 'Receipt recorded', description: `${qty} × ${item.item_name} added and flagged for review, since no shipment matches it.`, variant: 'destructive' });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle>Record an unlisted receipt</DialogTitle>
        <DialogDescription>For goods that arrived without a matching shipment. The stock is added and flagged for review.</DialogDescription>
      </DialogHeader>
      <Field label="Receiving store" htmlFor="unl-store"><StoreSelect id="unl-store" value={storeId} onChange={setStoreId} stores={stores} /></Field>
      <Field label="Item" htmlFor="unl-item">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger id="unl-item"><SelectValue placeholder="Select item" /></SelectTrigger>
          <SelectContent>{inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.item_name} · {i.stores?.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Quantity" htmlFor="unl-qty"><Input id="unl-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))} className="num" /></Field>
      <Field label="Remarks" htmlFor="unl-remarks" hint="Optional"><Textarea id="unl-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} /></Field>
      <FormError>{error}</FormError>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={receive.isPending}>Cancel</Button>
        <Button type="submit" disabled={receive.isPending}>{receive.isPending && <Loader2 className="animate-spin" aria-hidden />} Record receipt</Button>
      </DialogFooter>
    </form>
  );
}
