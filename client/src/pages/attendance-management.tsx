import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle2, XCircle, Coffee, Search, Download } from 'lucide-react';
import { format } from 'date-fns';
import type { Worker, Attendance, Site } from '@shared/schema';

export default function AttendanceManagementPage() {
  const { userRole, userId } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
  });

  // Fetch workers
  const { data: workers } = useQuery({
    queryKey: ['/api/workers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('*, sites(site_name), portfolios(portfolio_name), positions(position_name)')
        .order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch attendance records
  const { data: attendanceRecords, isLoading: loadingAttendance } = useQuery({
    queryKey: ['/api/attendance-management', selectedDate, filterSite, filterType, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*, workers(name, worker_type), sites(site_name)')
        .eq('date', selectedDate);

      if (filterSite !== 'all') {
        query = query.eq('site_id', filterSite);
      }

      if (filterType !== 'all') {
        query = query.eq('worker_type', filterType);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query.order('timestamp', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Filter by search query
  const filteredRecords = attendanceRecords?.filter((record) => {
    const workerName = record.workers?.name?.toLowerCase() || '';
    return workerName.includes(searchQuery.toLowerCase());
  }) || [];

  // Calculate stats
  const stats = attendanceRecords?.reduce(
    (acc, record) => {
      acc[record.status.toLowerCase()]++;
      acc.total++;
      return acc;
    },
    { present: 0, absent: 0, leave: 0, total: 0 }
  ) || { present: 0, absent: 0, leave: 0, total: 0 };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and query attendance records across all sites and workers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
            data-testid="input-date"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Present</p>
                <p className="text-3xl font-bold mt-1 text-chart-3">{stats.present}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-chart-3" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Absent</p>
                <p className="text-3xl font-bold mt-1 text-destructive">{stats.absent}</p>
              </div>
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On Leave</p>
                <p className="text-3xl font-bold mt-1 text-chart-2">{stats.leave}</p>
              </div>
              <Coffee className="h-8 w-8 text-chart-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>
            View and query attendance for {format(new Date(selectedDate), 'MMMM dd, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
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
                <SelectTrigger className="w-[180px]" data-testid="select-filter-site">
                  <SelectValue placeholder="Filter by site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.siteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
                <SelectValue placeholder="Worker type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="grounds">Grounds</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Present">Present</SelectItem>
                <SelectItem value="Absent">Absent</SelectItem>
                <SelectItem value="Leave">Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Records Table */}
          {loadingAttendance ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No attendance records found for this date and filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Worker
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Site
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, idx) => (
                    <tr
                      key={record.id}
                      className={idx % 2 === 0 ? 'bg-muted/30' : ''}
                      data-testid={`attendance-record-${record.id}`}
                    >
                      <td className="py-3 px-4">{record.workers?.name}</td>
                      <td className="py-3 px-4">{record.sites?.site_name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {record.workers?.worker_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            record.status === 'Present'
                              ? 'default'
                              : record.status === 'Absent'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {format(new Date(record.timestamp), 'HH:mm:ss')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

