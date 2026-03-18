import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Package, TrendingUp, TrendingDown, ArrowRight, Plus, FileText, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { queryClient } from '@/lib/queryClient';
import type { Store, Inventory, GoodsLog, Invoice } from '@shared/schema';
import { useAuth } from '@/lib/auth';

export default function StoreLogisticsPage() {
  const { toast } = useToast();
  const { userStoreId } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch stores
  const { data: stores, isLoading: loadingStores } = useQuery({
    queryKey: ['/api/stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').order('name');
      if (error) throw error;
      return data as Store[];
    },
  });

  // Fetch inventory for THIS store
  const { data: inventory, isLoading: loadingInventory } = useQuery({
    queryKey: ['/api/inventory', userStoreId],
    queryFn: async () => {
      if (!userStoreId) return [];
      const { data, error } = await supabase
        .from('inventory')
        .select('*, stores(name, location)')
        .eq('store_id', userStoreId)
        .order('item_name');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!userStoreId,
    refetchInterval: 7000,
  });

  // Fetch goods logs involving THIS store (sent or received)
  const { data: goodsLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['/api/goods-logs', userStoreId],
    queryFn: async () => {
      if (!userStoreId) return [];
      const { data, error } = await supabase
        .from('goods_log')
        .select('*, inventory(item_name), from_store:stores!goods_log_store_from_fkey(id,name), to_store:stores!goods_log_store_to_fkey(id,name)')
        .or(`store_from.eq.${userStoreId},store_to.eq.${userStoreId}`)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!userStoreId,
    refetchInterval: 7000,
  });

  // Fetch invoices for THIS store
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['/api/invoices', userStoreId],
    queryFn: async () => {
      if (!userStoreId) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*, stores(name), inventory(item_name)')
        .eq('store_id', userStoreId)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!userStoreId,
    refetchInterval: 10000,
  });

  const filteredInventory = inventory?.filter((item) =>
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const lowStockItems = inventory?.filter((item) => item.quantity < 10) || [];

  if (loadingStores || loadingInventory) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const managerStore = stores?.find(s => s.id === userStoreId);
  const totalItems = inventory?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {managerStore?.name ? `${managerStore.name} Portal` : 'Store Manager Portal'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage logistics and inventory
          </p>
        </div>
        <div className="flex gap-2">
          {userStoreId && (
            <>
              <AddInventoryDialog userStoreId={userStoreId} />
              <AddGoodsLogDialog stores={stores || []} inventory={inventory || []} userStoreId={userStoreId} goodsLogs={goodsLogs || []} />
              <AddInvoiceDialog inventory={inventory || []} userStoreId={userStoreId} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {managerStore && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">{managerStore.name}</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">{managerStore.location}</p>
                  <p className="text-2xl font-bold mt-1">{totalItems}</p>
                  <p className="text-xs text-muted-foreground">Total items in stock</p>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    {inventory?.length || 0} unique items
                  </p>
                  <Progress value={((inventory?.length || 0) / 20) * 100} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {lowStockItems.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              Low Stock Alert
            </CardTitle>
            <CardDescription>{lowStockItems.length} items running low</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.slice(0, 10).map((item) => (
                <Badge key={item.id} variant="destructive">
                  {item.item_name}: {item.quantity}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="inventory" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="goods">Goods Movement</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle>Inventory Overview</CardTitle>
              </div>
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {filteredInventory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No inventory items found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase text-muted-foreground">Item</th>
                        <th className="text-right py-3 px-4 text-xs font-medium uppercase text-muted-foreground">Quantity</th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase text-muted-foreground">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item, idx) => (
                        <tr key={item.id} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="py-3 px-4 font-medium">{item.item_name}</td>
                          <td className="py-3 px-4 text-right font-mono">
                            <span className={item.quantity < 10 ? 'text-destructive font-semibold' : ''}>
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                            {format(new Date(item.last_updated), 'MMM dd, yyyy HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goods" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Goods Movement Log</CardTitle>
            </CardHeader>
            <CardContent>
              {!goodsLogs || goodsLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No records</div>
              ) : (
                <div className="space-y-3">
                  {goodsLogs.map((log) => (
                    <div key={log.id} className="flex flex-wrap items-center gap-3 p-4 rounded-md border">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-medium flex items-center gap-2">
                          {log.inventory?.item_name}
                          {log.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                          {log.status === 'matched' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          {log.type === 'sent' ? (
                            <>
                              <Badge variant="outline" className="text-xs">{log.store_from?.name || 'Unknown'}</Badge>
                              <ArrowRight className="h-3 w-3" />
                              <Badge variant="outline" className="text-xs">{log.store_to?.name}</Badge>
                            </>
                          ) : (
                            <>
                              <TrendingUp className="h-3 w-3" />
                              <Badge variant="outline" className="text-xs">{log.store_to?.name}</Badge>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-lg font-semibold">{log.quantity}</p>
                        <Badge variant={log.type === 'sent' ? 'secondary' : 'default'} className="text-xs">
                          {log.type}
                        </Badge>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <p className="text-xs text-muted-foreground font-mono">
                          {format(new Date(log.date), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {!invoices || invoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No invoices</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-xs uppercase text-muted-foreground">Item</th>
                        <th className="text-left py-3 px-4 text-xs uppercase text-muted-foreground">Supplier</th>
                        <th className="text-left py-3 px-4 text-xs uppercase text-muted-foreground">Type</th>
                        <th className="text-right py-3 px-4 text-xs uppercase text-muted-foreground">Amount</th>
                        <th className="text-left py-3 px-4 text-xs uppercase text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice, idx) => (
                        <tr key={invoice.id} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="py-3 px-4">{invoice.inventory?.item_name}</td>
                          <td className="py-3 px-4">{invoice.supplier_name}</td>
                          <td className="py-3 px-4">
                            <Badge variant={invoice.type === 'purchase' ? 'secondary' : 'default'}>{invoice.type}</Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-mono">${invoice.amount.toLocaleString()}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{format(new Date(invoice.date), 'MMM dd, yyyy')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Add Inventory
function AddInventoryDialog({ userStoreId }: { userStoreId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ itemName: '', quantity: '' });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: existing, error: fetchErr } = await supabase.from('inventory')
        .select('*').eq('store_id', userStoreId).eq('item_name', formData.itemName).maybeSingle();
      
      if (fetchErr) throw fetchErr;

      if (existing) {
        const { error: updErr } = await supabase.from('inventory').update({ quantity: existing.quantity + parseInt(formData.quantity), last_updated: new Date() }).eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('inventory').insert({
          store_id: userStoreId,
          item_name: formData.itemName,
          quantity: parseInt(formData.quantity)
        });
        if (insErr) throw insErr;
      }

      toast({ title: "Success", description: "Item added. You can add another." });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setFormData({ itemName: '', quantity: '' });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />Add Item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Item Name</Label>
            <Input value={formData.itemName} onChange={e => setFormData({ ...formData, itemName: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Goods Log
function AddGoodsLogDialog({ stores, inventory, userStoreId, goodsLogs }: { stores: Store[]; inventory: any[]; userStoreId: string; goodsLogs: any[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ itemId: '', otherStoreId: '', quantity: '', logId: '', type: 'sent' as 'sent' | 'received' });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const quantity = parseInt(formData.quantity);
      if (isNaN(quantity) || quantity <= 0) throw new Error('Quantity required');

      // Helper for inventory targets
      const addToInventory = async (storeId: string, itemName: string, qty: number) => {
        const { data: targetRow, error: fetchErr } = await supabase.from('inventory')
          .select('*').eq('store_id', storeId).eq('item_name', itemName).maybeSingle();

        if (fetchErr) throw fetchErr;

        if (targetRow) {
          const { error: updErr } = await supabase.from('inventory').update({ quantity: (targetRow.quantity || 0) + qty, last_updated: new Date() }).eq('id', targetRow.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase.from('inventory').insert({ store_id: storeId, item_name: itemName, quantity: qty, last_updated: new Date() });
          if (insErr) throw insErr;
        }
      };

      if (formData.type === 'sent') {
        if (!formData.otherStoreId) throw new Error('Target store is required');
        const { data: srcItem } = await supabase.from('inventory').select('*').eq('id', formData.itemId).single();
        if ((srcItem.quantity || 0) < quantity) throw new Error('Insufficient quantity');
        
        // Decrement source immediately
        const { error: decErr } = await supabase.from('inventory').update({ quantity: srcItem.quantity - quantity }).eq('id', srcItem.id);
        if (decErr) throw decErr;
        // Create sent log as pending
        const { error: logErr } = await supabase.from('goods_log').insert({
          item_id: formData.itemId,
          store_from: userStoreId,
          store_to: formData.otherStoreId,
          quantity,
          type: 'sent',
          status: 'pending'
        });
        if (logErr) throw logErr;
        toast({ title: 'Success', description: 'Transfer sent' });
      } else {
        // Received logic
        if (!formData.logId) throw new Error('You must select an incoming transfer');
        const pendingLog = goodsLogs.find(l => l.id === formData.logId);
        if (!pendingLog) throw new Error('Pending transfer not found');
        
        if (pendingLog.quantity === quantity) {
          // Merged matched log
          const { error: updErr } = await supabase.from('goods_log').update({ status: 'matched' }).eq('id', pendingLog.id);
          if (updErr) throw updErr;
          await addToInventory(userStoreId, pendingLog.inventory?.item_name || 'Unknown', quantity);
          toast({ title: 'Success', description: 'Transfer matched perfectly!' });
        } else {
          // Mismatched
          const { error: err1 } = await supabase.from('goods_log').update({ status: 'error' }).eq('id', pendingLog.id);
          if (err1) throw err1;
          const { error: err2 } = await supabase.from('goods_log').insert({
            item_id: pendingLog.item_id,
            store_from: pendingLog.store_from,
            store_to: userStoreId,
            quantity,
            type: 'received',
            status: 'error',
            reference_id: pendingLog.id
          });
          if (err2) throw err2;
          await addToInventory(userStoreId, pendingLog.inventory?.item_name || 'Unknown', quantity);
          toast({ title: 'Error flagged', description: 'Quantity mismatch - flagged for owner review', variant: 'destructive' });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/goods-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setFormData({ ...formData, quantity: '' });
      // Keep modal open so they can add another (batch adding feature equivalent)
      toast({ title: "Success", description: "Saved. You can log another if needed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ArrowRight className="h-4 w-4 mr-2" />Log Transfer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Transfer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v, itemId: '', logId: '', otherStoreId: '' })} required>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sent">Sending Out</SelectItem>
                <SelectItem value="received">Receiving In</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'sent' && (
            <>
              <div className="space-y-2">
                <Label>To Store</Label>
                <Select value={formData.otherStoreId} onValueChange={v => setFormData({ ...formData, otherStoreId: v })} required>
                  <SelectTrigger><SelectValue placeholder="Select target store" /></SelectTrigger>
                  <SelectContent>
                    {stores.filter(s => s.id && s.id !== userStoreId).map(store => (
                      <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Item to Send</Label>
                <Select value={formData.itemId} onValueChange={v => setFormData({ ...formData, itemId: v })} required>
                  <SelectTrigger><SelectValue placeholder="Select from your inventory" /></SelectTrigger>
                  <SelectContent>
                    {inventory.filter(item => item.id).map(item => (
                      <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {formData.type === 'received' && (
            <div className="space-y-2">
              <Label>Incoming Transfer</Label>
              <Select value={formData.logId} onValueChange={v => setFormData({ ...formData, logId: v })} required>
                <SelectTrigger><SelectValue placeholder="Select incoming shipment" /></SelectTrigger>
                <SelectContent>
                  {goodsLogs.filter(log => log.store_to === userStoreId && log.status === 'pending' && log.type === 'sent').map(log => (
                    <SelectItem key={log.id} value={log.id}>{log.inventory?.item_name || 'Item'} from {log.from_store?.name} (Expected: {log.quantity})</SelectItem>
                  ))}
                  {goodsLogs.filter(log => log.store_to === userStoreId && log.status === 'pending' && log.type === 'sent').length === 0 && (
                    <SelectItem value="none" disabled>No incoming transfers</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>Log Transfer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Invoice
function AddInvoiceDialog({ inventory, userStoreId }: { inventory: any[]; userStoreId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ itemId: '', amount: '', supplierName: '', type: 'purchase' as 'purchase' | 'sale' });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Create invoice
      const { error: invErr } = await supabase.from('invoices').insert({
        store_id: userStoreId,
        item_id: formData.itemId,
        amount: parseInt(formData.amount),
        supplier_name: formData.supplierName,
        type: formData.type,
      });
      if (invErr) throw invErr;

      // Fetch the item
      const { data: itemData, error: itemErr } = await supabase.from('inventory').select('*').eq('id', formData.itemId).single();
      if (itemErr) throw itemErr;
      
      // Update inventory (Sale = -1, Purchase = +1)
      const quantityDiff = formData.type === 'purchase' ? 1 : -1;
      
      if (itemData) {
        const { error: updErr } = await supabase.from('inventory').update({ quantity: (itemData.quantity || 0) + quantityDiff }).eq('id', formData.itemId);
        if (updErr) throw updErr;
      }

      toast({ title: "Success", description: "Invoice saved. You can add another." });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setFormData({ itemId: '', amount: '', supplierName: '', type: 'purchase' });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-2" />Add Invoice</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Invoice</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })} required>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Purchase (+1 Stock)</SelectItem>
                <SelectItem value="sale">Sale (-1 Stock)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Item</Label>
            <Select value={formData.itemId} onValueChange={v => setFormData({ ...formData, itemId: v })} required>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {inventory.map(item => (
                  <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Supplier/Customer Name</Label>
            <Input value={formData.supplierName} onChange={e => setFormData({ ...formData, supplierName: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input type="number" min="0" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>Add Invoice</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
