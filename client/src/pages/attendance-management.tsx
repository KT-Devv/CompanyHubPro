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
import { Calendar, CheckCircle2, XCircle, Coffee, Search, Clock3 } from 'lucide-react';
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
        .select('*, portfolios(portfolio_name), positions(position_name)')
        .order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch attendance records
  const { data: attendanceRecords, isLoading: loadingAttendance } = useQuery({
    queryKey: ['/api/attendance-management', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data as any[];
    },
    // Auto-refresh attendance records for management view
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Get worker details and enrich attendance records
  const enrichedRecords = attendanceRecords?.map((record) => {
    const worker = workers?.find((w: any) => w.id === record.worker_id);
    const site = sites?.find((s: any) => s.id === worker?.site_id);
    return {
      ...record,
      worker_details: worker,
      site_details: site,
    };
  }) || [];

  // Apply filters on enriched records
  const filteredRecords = enrichedRecords.filter((record) => {
    const workerName = record.worker_details?.name?.toLowerCase() || '';
    const matchesSearch = workerName.includes(searchQuery.toLowerCase());
    const matchesSite = filterSite === 'all' || record.worker_details?.site_id === filterSite;
    const matchesType = filterType === 'all' || record.worker_type === filterType;
    const matchesStatus = filterStatus === 'all' || record.status === filterStatus;
    
    return matchesSearch && matchesSite && matchesType && matchesStatus;
  });

  // Calculate stats
  const stats = attendanceRecords?.reduce(
    (acc, record) => {
      const status = record.status.toLowerCase().replace(' ', ''); // 'Half Day' -> 'halfday'
      if (status in acc) {
        acc[status]++;
      }
      acc.total++;
      return acc;
    },
    { present: 0, absent: 0, leave: 0, halfday: 0, total: 0 }
  ) || { present: 0, absent: 0, leave: 0, halfday: 0, total: 0 };

  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="animate-in fade-in slide-in-from-left-4 duration-700">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Attendance Management</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            View and query attendance records across all sites and workers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hidden sm:block" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-auto"
            data-testid="input-date"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Present</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1 text-chart-3">{stats.present}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-chart-3" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Absent</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1 text-destructive">{stats.absent}</p>
              </div>
              <XCircle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">On Leave</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1 text-chart-2">{stats.leave}</p>
              </div>
              <Coffee className="h-6 w-6 sm:h-8 sm:w-8 text-chart-2" />
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Half Day</p>
                <p className="text-2xl sm:text-3xl font-bold mt-1 text-yellow-500">
                  {stats.halfday}
                </p>
              </div>
              <Clock3 className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 w-full sm:min-w-[200px]">
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
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-filter-site">
                  <SelectValue placeholder="Filter by site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site: any) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.site_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-filter-type">
                <SelectValue placeholder="Worker type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="non-marking">Non-Marking</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Present">Present</SelectItem>
                <SelectItem value="Absent">Absent</SelectItem>
                <SelectItem value="Leave">Leave</SelectItem>
                <SelectItem value="Half Day">Half Day</SelectItem>
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
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Worker
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Site
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Type
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{record.worker_details?.name}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{record.site_details?.site_name}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <Badge variant="outline" className="text-xs">
                            {record.worker_type}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <Badge
                            variant={
                              record.status === 'Present'
                                ? 'default'
                                : record.status === 'Absent'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className={record.status === 'Half Day' ? 'bg-yellow-100 text-yellow-800' : ''}
                          >
                            {record.status}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 font-mono text-xs text-muted-foreground">
                          {record.timestamp ? format(new Date(record.timestamp), 'HH:mm:ss') : '-'}
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
