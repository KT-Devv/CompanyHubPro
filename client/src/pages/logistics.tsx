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
import { Package, TrendingUp, TrendingDown, ArrowRight, Plus, FileText, Search } from 'lucide-react';
import { format } from 'date-fns';
import { queryClient } from '@/lib/queryClient';
import type { Store, Inventory, GoodsLog, Invoice } from '@shared/schema';

export default function LogisticsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');

  // Fetch stores
  const { data: stores, isLoading: loadingStores } = useQuery({
    queryKey: ['/api/stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').order('name');
      if (error) throw error;
      return data as Store[];
    },
  });

  // Fetch inventory
  const { data: inventory, isLoading: loadingInventory } = useQuery({
    queryKey: ['/api/inventory', selectedStore],
    queryFn: async () => {
      let query = supabase.from('inventory').select('*, stores(name, location)');
      
      if (selectedStore !== 'all') {
        query = query.eq('store_id', selectedStore);
      }

      const { data, error } = await query.order('item_name');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch goods logs
  const { data: goodsLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['/api/goods-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goods_log')
        .select('*, inventory(item_name), store_from:stores!goods_log_store_from_fkey(name), store_to:stores!goods_log_store_to_fkey(name)')
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch invoices
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['/api/invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, stores(name), inventory(item_name)')
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  // Filter inventory
  const filteredInventory = inventory?.filter((item) =>
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Calculate low stock items
  const lowStockItems = inventory?.filter((item) => item.quantity < 10) || [];

  if (loadingStores) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Logistics Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage inventory across all stores
          </p>
        </div>
        <div className="flex gap-2">
          <AddInventoryDialog stores={stores || []} />
          <AddGoodsLogDialog stores={stores || []} inventory={inventory || []} />
          <AddInvoiceDialog stores={stores || []} inventory={inventory || []} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stores?.map((store) => {
          const storeInventory = inventory?.filter((item) => item.store_id === store.id) || [];
          const totalItems = storeInventory.reduce((sum, item) => sum + item.quantity, 0);

          return (
            <Card key={store.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">{store.name}</CardTitle>
                <Package className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">{store.location}</p>
                    <p className="text-2xl font-bold mt-1">{totalItems}</p>
                    <p className="text-xs text-muted-foreground">Total items in stock</p>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      {storeInventory.length} unique items
                    </p>
                    <Progress value={(storeInventory.length / 20) * 100} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Low Stock Alert */}
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
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
          <TabsTrigger value="goods" data-testid="tab-goods">Goods Movement</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle>Inventory Overview</CardTitle>
                <CardDescription>Track stock levels across all stores</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-inventory"
                  />
                </div>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="w-[180px]" data-testid="select-store-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores?.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingInventory ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No inventory items found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Item
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Store
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Quantity
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Last Updated
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={idx % 2 === 0 ? 'bg-muted/30' : ''}
                          data-testid={`inventory-item-${item.id}`}
                        >
                          <td className="py-3 px-4 font-medium">{item.item_name}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{item.stores.name}</Badge>
                          </td>
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
              <CardDescription>Track items sent and received between stores</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : !goodsLogs || goodsLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No goods movement records
                </div>
              ) : (
                <div className="space-y-3">
                  {goodsLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center gap-3 p-4 rounded-md border"
                      data-testid={`goods-log-${log.id}`}
                    >
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-medium">{log.inventory?.item_name}</p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          {log.type === 'sent' ? (
                            <>
                              <Badge variant="outline" className="text-xs">{log.store_from?.name}</Badge>
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
                        <p className="text-xs text-muted-foreground font-mono">
                          {format(new Date(log.date), 'HH:mm')}
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
              <CardDescription>Purchase and sale invoices</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : !invoices || invoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No invoices found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Item
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Store
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Supplier
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Type
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Amount
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice, idx) => (
                        <tr
                          key={invoice.id}
                          className={idx % 2 === 0 ? 'bg-muted/30' : ''}
                          data-testid={`invoice-${invoice.id}`}
                        >
                          <td className="py-3 px-4">{invoice.inventory?.item_name}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{invoice.stores.name}</Badge>
                          </td>
                          <td className="py-3 px-4">{invoice.supplier_name}</td>
                          <td className="py-3 px-4">
                            <Badge variant={invoice.type === 'purchase' ? 'secondary' : 'default'}>
                              {invoice.type}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            ${invoice.amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                            {format(new Date(invoice.date), 'MMM dd, yyyy')}
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
      </Tabs>
    </div>
  );
}

// Add Inventory Dialog Component
function AddInventoryDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    storeId: '',
    itemName: '',
    quantity: '',
  });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('inventory').insert({
        store_id: formData.storeId,
        item_name: formData.itemName,
        quantity: parseInt(formData.quantity),
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Inventory item added successfully",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setOpen(false);
      setFormData({ storeId: '', itemName: '', quantity: '' });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add inventory",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-add-inventory">
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>Add a new item to store inventory</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store">Store</Label>
            <Select value={formData.storeId} onValueChange={(v) => setFormData({ ...formData, storeId: v })} required>
              <SelectTrigger id="store" data-testid="select-inventory-store">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="itemName">Item Name</Label>
            <Input
              id="itemName"
              value={formData.itemName}
              onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
              placeholder="e.g., Cement bags"
              required
              data-testid="input-item-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="0"
              required
              data-testid="input-quantity"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-inventory">
              {loading ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Goods Log Dialog Component
function AddGoodsLogDialog({ stores, inventory }: { stores: Store[]; inventory: any[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    itemId: '',
    storeFrom: '',
    storeTo: '',
    quantity: '',
    type: 'sent' as 'sent' | 'received',
  });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('goods_log').insert({
        item_id: formData.itemId,
        store_from: formData.type === 'sent' ? formData.storeFrom : null,
        store_to: formData.storeTo,
        quantity: parseInt(formData.quantity),
        type: formData.type,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Goods log added successfully",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/goods-logs'] });
      setOpen(false);
      setFormData({ itemId: '', storeFrom: '', storeTo: '', quantity: '', type: 'sent' });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add goods log",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-add-goods-log">
          <ArrowRight className="h-4 w-4 mr-2" />
          Log Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Goods Movement</DialogTitle>
          <DialogDescription>Record goods sent or received</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })} required>
              <SelectTrigger id="type" data-testid="select-log-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item">Item</Label>
            <Select value={formData.itemId} onValueChange={(v) => setFormData({ ...formData, itemId: v })} required>
              <SelectTrigger id="item" data-testid="select-log-item">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.item_name} ({item.stores.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formData.type === 'sent' && (
            <div className="space-y-2">
              <Label htmlFor="storeFrom">From Store</Label>
              <Select value={formData.storeFrom} onValueChange={(v) => setFormData({ ...formData, storeFrom: v })} required>
                <SelectTrigger id="storeFrom" data-testid="select-store-from">
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="storeTo">To Store</Label>
            <Select value={formData.storeTo} onValueChange={(v) => setFormData({ ...formData, storeTo: v })} required>
              <SelectTrigger id="storeTo" data-testid="select-store-to">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="logQuantity">Quantity</Label>
            <Input
              id="logQuantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="0"
              required
              data-testid="input-log-quantity"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-goods-log">
              {loading ? 'Logging...' : 'Log Movement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Invoice Dialog Component
function AddInvoiceDialog({ stores, inventory }: { stores: Store[]; inventory: any[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    storeId: '',
    itemId: '',
    amount: '',
    supplierName: '',
    type: 'purchase' as 'purchase' | 'sale',
  });
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('invoices').insert({
        store_id: formData.storeId,
        item_id: formData.itemId,
        amount: parseInt(formData.amount),
        supplier_name: formData.supplierName,
        type: formData.type,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Invoice added successfully",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setOpen(false);
      setFormData({ storeId: '', itemId: '', amount: '', supplierName: '', type: 'purchase' });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add invoice",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-add-invoice">
          <FileText className="h-4 w-4 mr-2" />
          Add Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice</DialogTitle>
          <DialogDescription>Record a purchase or sale invoice</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoiceType">Type</Label>
            <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })} required>
              <SelectTrigger id="invoiceType" data-testid="select-invoice-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceStore">Store</Label>
            <Select value={formData.storeId} onValueChange={(v) => setFormData({ ...formData, storeId: v })} required>
              <SelectTrigger id="invoiceStore" data-testid="select-invoice-store">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceItem">Item</Label>
            <Select value={formData.itemId} onValueChange={(v) => setFormData({ ...formData, itemId: v })} required>
              <SelectTrigger id="invoiceItem" data-testid="select-invoice-item">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.item_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier/Customer Name</Label>
            <Input
              id="supplier"
              value={formData.supplierName}
              onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
              placeholder="Enter name"
              required
              data-testid="input-supplier-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0"
              required
              data-testid="input-invoice-amount"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-invoice">
              {loading ? 'Adding...' : 'Add Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
