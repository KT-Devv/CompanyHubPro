import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Worker, Site } from '@shared/schema';
import { Search, Users } from 'lucide-react';

export default function WorkersManagementPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterType, setFilterType] = useState('all');

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
      const { data, error } = await supabase
        .from('workers')
        .select('*, sites(site_name), portfolios(portfolio_name, rate), positions(position_name, rate)')
        .order('name');
      if (error) throw error;
      return data as any[];
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
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-xs sm:text-sm">{filteredWorkers.length} total</span>
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
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Site</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Portfolio/Position</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate (₵)</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">National ID</th>
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


