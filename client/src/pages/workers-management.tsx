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
import { Search, Users, Plus, Pencil, Trash2, Eye, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WorkersManagementPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [editWorker, setEditWorker] = useState<any | null>(null);
  const [viewWorker, setViewWorker] = useState<any | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');


  // Fetch portfolios and positions for form selects
  const { data: portfolios } = useQuery({
    queryKey: ['/api/portfolios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('portfolios').select('id, portfolio_name');
      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: positions } = useQuery({
    queryKey: ['/api/positions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('positions').select('id, position_name');
      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
  });

  const { data: workers, isLoading } = useQuery({
    queryKey: ['/api/workers'],
    queryFn: async () => {
      const { data: workersData, error: workersError } = await supabase
        .from('workers')
        .select('*, portfolios(portfolio_name, rate), positions(position_name, rate)')
        .order('name');
      if (workersError) throw workersError;
      
      // Fetch sites separately and join
      const { data: sitesData, error: sitesError } = await supabase
        .from('sites')
        .select('id, site_name');
      if (sitesError) throw sitesError;
      
      // Join sites data (only permanent site, temporary is in attendance)
      return (workersData || []).map((worker: any) => ({
        ...worker,
        permanent_site: sitesData?.find((s: any) => s.id === worker.permanent_site_id),
      }));
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // 30 seconds
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
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

  const filteredAndSortedWorkers = useMemo(() => {
    const list = workers || [];
    const filtered = list.filter((w: any) => {
      const matchesSearch = (w.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || w.worker_type === filterType;
      return matchesSearch && matchesType;
    });

    // Sort the filtered list
    const sorted = [...filtered].sort((a: any, b: any) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'portfolio':
          aValue = a.worker_type === 'grounds' 
            ? (a.portfolios?.portfolio_name || '').toLowerCase()
            : (a.positions?.position_name || '').toLowerCase();
          bValue = b.worker_type === 'grounds'
            ? (b.portfolios?.portfolio_name || '').toLowerCase()
            : (b.positions?.position_name || '').toLowerCase();
          break;
        case 'site':
          aValue = (a.permanent_site?.site_name || '').toLowerCase();
          bValue = (b.permanent_site?.site_name || '').toLowerCase();
          break;
        case 'phone':
          aValue = (a.phone_number || '').toLowerCase();
          bValue = (b.phone_number || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [workers, searchQuery, filterType, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortButton = ({ column, children }: { column: string; children: React.ReactNode }) => {
    const isActive = sortColumn === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {children}
        {isActive ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="animate-in fade-in slide-in-from-left-4 duration-700">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">All Workers</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Browse, search and filter across all workers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-xs sm:text-sm">{filteredAndSortedWorkers.length} total</span>
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
                portfolios={portfolios || []}
                positions={positions || []}
                sites={sites || []}
                onSubmit={(payload) => addWorkerMutation.mutate(payload)}
                onCancel={() => setOpenAdd(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150">
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>Search by name, filter by type</CardDescription>
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
          ) : filteredAndSortedWorkers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No workers found for the selected filters
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <SortButton column="name">Name</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <SortButton column="portfolio">Portfolio/Position</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <SortButton column="site">Permanent Site</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <SortButton column="phone">Phone Number</SortButton>
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedWorkers.map((w: any, idx: number) => (
                      <tr 
                        key={w.id} 
                        className={`border-b transition-all duration-200 hover:bg-muted/50 hover:shadow-sm ${idx % 2 === 0 ? 'bg-muted/20' : ''} animate-in fade-in slide-in-from-left-4`}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <td className="py-3 px-4 text-sm font-medium">{w.name || '-'}</td>
                        <td className="py-3 px-4 text-sm">
                          {w.worker_type === 'grounds' ? (w.portfolios?.portfolio_name || '-') : (w.positions?.position_name || '-')}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {w.permanent_site?.site_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">{w.phone_number || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-2">
                            <Dialog open={!!viewWorker && viewWorker?.id === w.id} onOpenChange={(open) => setViewWorker(open ? w : null)}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="transition-all hover:scale-105">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Worker Details</DialogTitle>
                                  <DialogDescription>Complete information for {w.name}</DialogDescription>
                                </DialogHeader>
                                <WorkerDetailsView worker={w} />
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setViewWorker(null)}>Close</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Dialog open={!!editWorker && editWorker?.id === w.id} onOpenChange={(open) => setEditWorker(open ? w : null)}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="transition-all hover:scale-105" data-testid={`button-edit-${w.id}`}>
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
                                  portfolios={portfolios || []}
                                  positions={positions || []}
                                  sites={sites || []}
                                  onSubmit={(payload) => updateWorkerMutation.mutate({ id: w.id, updates: payload })}
                                  onCancel={() => setEditWorker(null)}
                                />
                              </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              variant="outline"
                              className="transition-all hover:scale-105 hover:text-destructive"
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


function WorkerDetailsView({ worker }: { worker: any }) {
  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground">Full Name</Label>
          <p className="text-sm font-medium mt-1">{worker.name || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Worker Type</Label>
          <p className="text-sm font-medium mt-1">
            <Badge variant="outline">{worker.worker_type || '-'}</Badge>
          </p>
        </div>
        <div>
          <Label className="text-muted-foreground">Portfolio/Position</Label>
          <p className="text-sm font-medium mt-1">
            {worker.worker_type === 'grounds' 
              ? (worker.portfolios?.portfolio_name || '-')
              : (worker.positions?.position_name || '-')}
          </p>
        </div>
        <div>
          <Label className="text-muted-foreground">Rate</Label>
          <p className="text-sm font-medium mt-1">
            {worker.worker_type === 'grounds' 
              ? (worker.portfolios?.rate ? `₵${worker.portfolios.rate.toLocaleString()}` : '-')
              : (worker.positions?.rate ? `₵${worker.positions.rate.toLocaleString()}` : '-')}
          </p>
        </div>
        <div>
          <Label className="text-muted-foreground">Permanent Site</Label>
          <p className="text-sm font-medium mt-1">{worker.permanent_site?.site_name || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Phone Number</Label>
          <p className="text-sm font-medium mt-1">{worker.phone_number || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">National ID</Label>
          <p className="text-sm font-medium mt-1">{worker.national_id || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Date of Birth</Label>
          <p className="text-sm font-medium mt-1">{worker.dob || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Date of Employment</Label>
          <p className="text-sm font-medium mt-1">{worker.date_of_employment || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Hometown</Label>
          <p className="text-sm font-medium mt-1">{worker.hometown || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Current Location</Label>
          <p className="text-sm font-medium mt-1">{worker.current_location || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Contact Person</Label>
          <p className="text-sm font-medium mt-1">{worker.contact_person || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Contact Phone</Label>
          <p className="text-sm font-medium mt-1">{worker.cp_phone || '-'}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Contact Relation</Label>
          <p className="text-sm font-medium mt-1">{worker.cp_relation || '-'}</p>
        </div>
      </div>
    </div>
  );
}

function WorkerForm({ initial, portfolios, positions, sites, onSubmit, onCancel }: {
  initial?: any;
  portfolios: any[];
  positions: any[];
  sites: Site[];
  onSubmit: (payload: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<any>({
    name: initial?.name || '',
    worker_type: initial?.worker_type || 'grounds',
    portfolio_id: initial?.portfolio_id || '',
    position_id: initial?.position_id || '',
    permanent_site_id: initial?.permanent_site_id || '',
    phone_number: initial?.phone_number || '',
    national_id: initial?.national_id || '',
    dob: initial?.dob || '',
    date_of_employment: initial?.date_of_employment || '',
    contact_person: initial?.contact_person || '',
    cp_phone: initial?.cp_phone || '',
    cp_relation: initial?.cp_relation || '',
    hometown: initial?.hometown || '',
    current_location: initial?.current_location || '',
  });

  // Check if portfolio is "helpers" (case-insensitive) - useMemo to recalculate when form changes
  const isHelpers = useMemo(() => {
    if (form.worker_type !== 'grounds' || !form.portfolio_id) return false;
    const selectedPortfolio = portfolios.find((p: any) => p.id === form.portfolio_id);
    return selectedPortfolio?.portfolio_name?.toLowerCase() === 'helpers';
  }, [form.portfolio_id, form.worker_type, portfolios]);

  // When portfolio changes
  const handlePortfolioChange = (portfolioId: string) => {
    setForm((prev: any) => ({
      ...prev,
      portfolio_id: portfolioId,
    }));
  };

  // When permanent site changes
  const handlePermanentSiteChange = (siteId: string) => {
    setForm((prev: any) => ({
      ...prev,
      permanent_site_id: siteId,
    }));
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      worker_type: form.worker_type,
      portfolio_id: form.worker_type === 'grounds' ? (form.portfolio_id || null) : null,
      position_id: form.worker_type === 'office' ? (form.position_id || null) : null,
      permanent_site_id: form.permanent_site_id || null,
      phone_number: form.phone_number,
      national_id: form.national_id,
      dob: form.dob || null,
      date_of_employment: form.date_of_employment || null,
      contact_person: form.contact_person || '',
      cp_phone: form.cp_phone || '',
      cp_relation: form.cp_relation || '',
      hometown: form.hometown || '',
      current_location: form.current_location || '',
    };

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="workerType">Worker Type</Label>
          <Select value={form.worker_type} onValueChange={(v) => setForm({ ...form, worker_type: v, portfolio_id: '', position_id: '' })}>
            <SelectTrigger id="workerType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grounds">Grounds</SelectItem>
              <SelectItem value="office">Office</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.worker_type === 'grounds' && (
          <div>
            <Label htmlFor="portfolio">Portfolio</Label>
            <Select value={form.portfolio_id} onValueChange={handlePortfolioChange}>
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
        <div>
          <Label htmlFor="permanentSite">Permanent Site</Label>
          <Select value={form.permanent_site_id} onValueChange={handlePermanentSiteChange}>
            <SelectTrigger id="permanentSite">
              <SelectValue placeholder="Select permanent site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s: Site) => (
                <SelectItem key={s.id} value={s.id}>{s.siteName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <div>
          <Label htmlFor="hometown">Hometown</Label>
          <Input id="hometown" value={form.hometown} onChange={(e) => setForm({ ...form, hometown: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="currentLocation">Current Location</Label>
          <Input id="currentLocation" value={form.current_location} onChange={(e) => setForm({ ...form, current_location: e.target.value })} />
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

