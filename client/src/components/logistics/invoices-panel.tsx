import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, ReceiptText } from 'lucide-react';
import { exportTable } from '@/lib/export';
import { formatDay, money, whole } from '@/lib/format';
import { errorMessage } from '@/lib/api/util';
import { useAddInvoice, useInvoices } from '@/lib/api/invoices';
import type { InventoryRow, InvoiceType, Store } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/empty-state';
import { ExportMenu } from '@/components/common/export-menu';
import { Field, Segmented } from '@/components/common/controls';

type Filter = 'all' | InvoiceType;
const TYPE_LABEL: Record<InvoiceType, string> = { purchase: 'Purchase', sale: 'Sale' };

export function InvoicesPanel({ scopeStoreId, canAdd, stores, inventory }: {
  /** A store manager only ever sees their own store's invoices. */
  scopeStoreId: string | null;
  canAdd: boolean;
  stores: Store[];
  inventory: InventoryRow[];
}) {
  const invoices = useInvoices(scopeStoreId);
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);

  const all = invoices.data ?? [];
  const rows = useMemo(() => all.filter((i) => filter === 'all' || i.type === filter), [all, filter]);
  const total = rows.reduce((t, i) => t + Number(i.amount), 0);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Invoice type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: all.length },
            { value: 'purchase', label: 'Purchases', count: all.filter((i) => i.type === 'purchase').length },
            { value: 'sale', label: 'Sales', count: all.filter((i) => i.type === 'sale').length },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <p className="num mr-2 text-sm text-muted-foreground">Total <span className="font-semibold text-foreground">{money(total)}</span></p>
          <ExportMenu
            disabled={rows.length === 0}
            onExport={(format) =>
              exportTable(format, {
                baseName: 'invoices',
                title: 'Invoices',
                subtitle: filter === 'all' ? 'All invoices' : `${TYPE_LABEL[filter]} invoices`,
                head: ['Date', 'Invoice no.', 'Type', 'Store', 'Item', 'Quantity', 'Supplier / customer', 'Amount'],
                body: rows.map((i) => [i.date.slice(0, 10), i.invoice_number ?? '', TYPE_LABEL[i.type], i.stores?.name ?? '', i.inventory?.item_name ?? '', i.quantity, i.supplier_name, Number(i.amount)]),
                foot: ['Total', '', '', '', '', '', '', total],
                moneyColumns: [7],
                landscape: true,
              })
            }
          />
          {canAdd && <Button onClick={() => setAddOpen(true)} data-testid="button-add-invoice"><Plus /> Add invoice</Button>}
        </div>
      </div>

      {invoices.isLoading ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : invoices.isError ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load invoices" description={errorMessage(invoices.error)} action={<Button variant="outline" onClick={() => invoices.refetch()}>Try again</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No invoices yet" description="Purchases and sales you record are listed here, newest first." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Supplier / customer</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} data-testid={`invoice-${i.id}`}>
                  <TableCell className="num whitespace-nowrap text-muted-foreground">{formatDay(i.date.slice(0, 10), 'd MMM yyyy')}</TableCell>
                  <TableCell>
                    <span className="num">{i.invoice_number || '-'}</span>
                    <Badge variant={i.type === 'purchase' ? 'info' : 'success'} className="ml-2">{TYPE_LABEL[i.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{i.inventory?.item_name ?? 'Item'}</p>
                    {!scopeStoreId && <p className="text-xs text-muted-foreground">{i.stores?.name}</p>}
                  </TableCell>
                  <TableCell>{i.supplier_name}</TableCell>
                  <TableCell className="num text-right">{whole(i.quantity)}</TableCell>
                  <TableCell className="num text-right font-medium">{money(Number(i.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          {addOpen && <AddInvoiceForm stores={stores} inventory={inventory} fixedStoreId={scopeStoreId} onDone={() => setAddOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddInvoiceForm({ stores, inventory, fixedStoreId, onDone }: { stores: Store[]; inventory: InventoryRow[]; fixedStoreId: string | null; onDone: () => void }) {
  const { toast } = useToast();
  const add = useAddInvoice();
  const [storeId, setStoreId] = useState(fixedStoreId ?? '');
  const [itemId, setItemId] = useState('');
  const [type, setType] = useState<InvoiceType>('purchase');
  const [supplier, setSupplier] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = inventory.filter((i) => i.store_id === storeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return setError('Choose a store.');
    if (!itemId) return setError('Choose the item.');
    setError(null);
    try {
      await add.mutateAsync({ storeId, itemId, type, supplierName: supplier, invoiceNumber: number, amount: Number(amount), quantity: Number(quantity) });
      toast({ title: 'Invoice recorded', description: `${money(Number(amount))} ${type === 'purchase' ? 'from' : 'to'} ${supplier.trim()}.` });
      onDone();
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Add an invoice</DialogTitle>
        <DialogDescription>Recording an invoice does not change stock levels. Add or send stock separately.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type" htmlFor="inv-type">
          <Select value={type} onValueChange={(v) => setType(v as InvoiceType)}>
            <SelectTrigger id="inv-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Invoice number" htmlFor="inv-number" hint="Optional">
          <Input id="inv-number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
      </div>
      <Field label="Store" htmlFor="inv-store">
        <Select value={storeId} onValueChange={(v) => { setStoreId(v); setItemId(''); }} disabled={!!fixedStoreId}>
          <SelectTrigger id="inv-store"><SelectValue placeholder="Choose a store" /></SelectTrigger>
          <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Item" htmlFor="inv-item">
        <Select value={itemId} onValueChange={setItemId} disabled={!storeId}>
          <SelectTrigger id="inv-item"><SelectValue placeholder={storeId ? 'Choose an item' : 'Choose a store first'} /></SelectTrigger>
          <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label={type === 'purchase' ? 'Supplier' : 'Customer'} htmlFor="inv-supplier">
        <Input id="inv-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} data-testid="input-invoice-supplier" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount (₵)" htmlFor="inv-amount">
          <Input id="inv-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className="num" data-testid="input-invoice-amount" />
        </Field>
        <Field label="Quantity" htmlFor="inv-qty">
          <Input id="inv-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} className="num" data-testid="input-invoice-quantity" />
        </Field>
      </div>
      {error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={add.isPending}>Cancel</Button>
        <Button type="submit" disabled={add.isPending} data-testid="button-save-invoice">
          {add.isPending && <Loader2 className="animate-spin" aria-hidden />} Save invoice
        </Button>
      </DialogFooter>
    </form>
  );
}
