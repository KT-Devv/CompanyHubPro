import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Worker, Site } from '@shared/schema';
import { Search, Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WorkersManagementPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [editWorker, setEditWorker] = useState<any | null>(null);
  const [openAdd, setOpenAdd] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Fetch portfolios and positions for form selects
  const { data: portfolios } = useQuery({
    queryKey: ['/api/portfolios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('portfolios').select('id, portfolio_name');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: positions } = useQuery({
    queryKey: ['/api/positions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('positions').select('id, position_name');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: workers, isLoading } = useQuery({
    queryKey: ['/api/workers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('*, sites(site_name), portfolios(portfolio_name, rate), positions(position_name, rate)')
        .order('name');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Mutations
  const addWorkerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('workers').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workers'] });
      setOpenAdd(false);
      toast({ title: 'Worker added', description: 'New worker has been created' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateWorkerMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from('workers').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workers'] });
      setEditWorker(null);
      toast({ title: 'Worker updated', description: 'Changes have been saved' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workers'] });
      toast({ title: 'Worker deleted', description: 'Worker has been removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const filteredWorkers = useMemo(() => {
    const list = workers || [];
    return list.filter((w: any) => {
      const matchesSearch = (w.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSite = filterSite === 'all' || w.site_id === filterSite;
      const matchesType = filterType === 'all' || w.worker_type === filterType;
      return matchesSearch && matchesSite && matchesType;
    });
  }, [workers, searchQuery, filterSite, filterType]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">All Workers</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Browse, search and filter across all workers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-xs sm:text-sm">{filteredWorkers.length} total</span>
          </div>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-worker">
                <Plus className="h-4 w-4 mr-2" />
                Add Worker
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Worker</DialogTitle>
                <DialogDescription>Create a new worker</DialogDescription>
              </DialogHeader>
              <WorkerForm
                sites={sites || []}
                portfolios={portfolios || []}
                positions={positions || []}
                onSubmit={(payload) => addWorkerMutation.mutate(payload)}
                onCancel={() => setOpenAdd(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>Search by name, filter by site and type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 w-full sm:min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search workers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-workers"
                />
              </div>
            </div>
            {sites && (
              <Select value={filterSite} onValueChange={setFilterSite}>
                <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-filter-site">
                  <SelectValue placeholder="Filter by site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site: any) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.site_name || site.siteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-filter-type">
                <SelectValue placeholder="Worker type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="grounds">Grounds</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </div>

          { isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No workers found for the selected filters
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Site</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Portfolio/Position</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate (₵)</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">National ID</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkers.map((w: any, idx: number) => (
                      <tr key={w.id} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm font-medium">{w.name}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <Badge variant="outline" className="text-xs">{w.worker_type}</Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{w.sites?.site_name || '-'}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">
                          {w.worker_type === 'grounds' ? (w.portfolios?.portfolio_name || '-') : (w.positions?.position_name || '-')}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">
                          {w.worker_type === 'grounds' 
                            ? (w.portfolios?.rate ? `₵${w.portfolios.rate.toLocaleString()}` : '-')
                            : (w.positions?.rate ? `₵${w.positions.rate.toLocaleString()}` : '-')}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{w.phone_number}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{w.national_id}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <div className="flex justify-end gap-2">
                            <Dialog open={!!editWorker && editWorker?.id === w.id} onOpenChange={(open) => setEditWorker(open ? w : null)}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" data-testid={`button-edit-${w.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[95vw] sm:max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>Edit Worker</DialogTitle>
                                  <DialogDescription>Update worker details</DialogDescription>
                                </DialogHeader>
                                <WorkerForm
                                  initial={w}
                                  sites={sites || []}
                                  portfolios={portfolios || []}
                                  positions={positions || []}
                                  onSubmit={(payload) => updateWorkerMutation.mutate({ id: w.id, updates: payload })}
                                  onCancel={() => setEditWorker(null)}
                                />
                              </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-delete-${w.id}`}
                              onClick={() => {
                                if (confirm(`Delete ${w.name}? This cannot be undone.`)) {
                                  deleteWorkerMutation.mutate(w.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function WorkerForm({ initial, sites, portfolios, positions, onSubmit, onCancel }: {
  initial?: any;
  sites: any[];
  portfolios: any[];
  positions: any[];
  onSubmit: (payload: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<any>({
    name: initial?.name || '',
    worker_type: initial?.worker_type || 'grounds',
    site_id: initial?.site_id || '',
    portfolio_id: initial?.portfolio_id || '',
    position_id: initial?.position_id || '',
    phone_number: initial?.phone_number || '',
    national_id: initial?.national_id || '',
    dob: initial?.dob || '',
    date_of_employment: initial?.date_of_employment || '',
    contact_person: initial?.contact_person || '',
    cp_phone: initial?.cp_phone || '',
    cp_relation: initial?.cp_relation || '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      worker_type: form.worker_type,
      site_id: form.site_id || null,
      portfolio_id: form.worker_type === 'grounds' ? (form.portfolio_id || null) : null,
      position_id: form.worker_type === 'office' ? (form.position_id || null) : null,
      phone_number: form.phone_number,
      national_id: form.national_id,
      dob: form.dob || null,
      date_of_employment: form.date_of_employment || null,
      contact_person: form.contact_person || '',
      cp_phone: form.cp_phone || '',
      cp_relation: form.cp_relation || '',
    };

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="workerType">Worker Type</Label>
          <Select value={form.worker_type} onValueChange={(v) => setForm({ ...form, worker_type: v, portfolio_id: '', position_id: '', site_id: v === 'office' ? '' : form.site_id })}>
            <SelectTrigger id="workerType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grounds">Grounds</SelectItem>
              <SelectItem value="office">Office</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="site">Site</Label>
          <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v })}>
            <SelectTrigger id="site" disabled={form.worker_type === 'office'}>
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.site_name || s.siteName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.worker_type === 'grounds' && (
          <div>
            <Label htmlFor="portfolio">Portfolio</Label>
            <Select value={form.portfolio_id} onValueChange={(v) => setForm({ ...form, portfolio_id: v })}>
              <SelectTrigger id="portfolio">
                <SelectValue placeholder="Select portfolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.portfolio_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.worker_type === 'office' && (
          <div>
            <Label htmlFor="position">Position</Label>
            <Select value={form.position_id} onValueChange={(v) => setForm({ ...form, position_id: v })}>
              <SelectTrigger id="position">
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.position_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="nid">National ID</Label>
          <Input id="nid" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="dob">Date of Birth</Label>
          <Input id="dob" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="doe">Date of Employment</Label>
          <Input id="doe" type="date" value={form.date_of_employment} onChange={(e) => setForm({ ...form, date_of_employment: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cp">Contact Person</Label>
          <Input id="cp" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cpPhone">Contact Phone</Label>
          <Input id="cpPhone" value={form.cp_phone} onChange={(e) => setForm({ ...form, cp_phone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cpRel">Relation</Label>
          <Input id="cpRel" value={form.cp_relation} onChange={(e) => setForm({ ...form, cp_relation: e.target.value })} />
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

