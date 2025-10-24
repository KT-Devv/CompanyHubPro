import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle2, XCircle, Coffee, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import type { Worker, Attendance, Site } from '@shared/schema';

export default function AttendancePage() {
  const { userRole, userId, userSiteId } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [markingMode, setMarkingMode] = useState<'mark' | 'view'>('mark');

  const isSupervisor = userRole === 'supervisor';
  const isSecretary = userRole === 'secretary';
  const isManagement = ['owner', 'hr', 'project_manager'].includes(userRole || '');

  // Fetch workers based on role
  const { data: workers, isLoading: loadingWorkers } = useQuery({
    queryKey: ['/api/workers', userRole, userSiteId],
    queryFn: async () => {
      let query = supabase.from('workers').select('*, sites(site_name), portfolios(portfolio_name), positions(position_name)');

      if (isSupervisor && userSiteId) {
        query = query.eq('site_id', userSiteId).eq('worker_type', 'grounds');
      } else if (isSecretary) {
        query = query.eq('worker_type', 'office');
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch sites for filtering
  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
    enabled: isManagement,
  });

  // Fetch attendance records for selected date (role-scoped)
  const { data: attendanceRecords, refetch: refetchAttendance } = useQuery({
    queryKey: ['/api/attendance', selectedDate, userRole, userSiteId],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*, workers(name), sites(site_name)')
        .eq('date', selectedDate);

      // Apply role-based filtering
      if (isSupervisor && userSiteId) {
        query = query.eq('site_id', userSiteId);
      } else if (isSecretary) {
        query = query.eq('worker_type', 'office');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const [attendanceData, setAttendanceData] = useState<Record<string, string>>({});

  // Mark attendance for a worker
  async function markAttendance(workerId: string, status: string) {
    setAttendanceData((prev) => ({ ...prev, [workerId]: status }));
  }

  // Submit all marked attendance
  async function submitAttendance() {
    const entries = Object.entries(attendanceData);
    if (entries.length === 0) {
      toast({
        title: "No attendance marked",
        description: "Please mark attendance for at least one worker",
        variant: "destructive",
      });
      return;
    }

    try {
      const attendanceEntries = entries.map(([workerId, status]) => {
        const worker = workers?.find((w) => w.id === workerId);
        return {
          worker_id: workerId,
          site_id: worker?.site_id,
          date: selectedDate,
          status,
          marked_by: userId,
          worker_type: worker?.worker_type,
        };
      });

      const { error } = await supabase.from('attendance').insert(attendanceEntries);
      if (error) throw error;

      toast({
        title: "Success",
        description: `Attendance marked for ${entries.length} worker(s)`,
      });

      setAttendanceData({});
      refetchAttendance();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit attendance",
        variant: "destructive",
      });
    }
  }

  // Mark all as present
  function markAllPresent() {
    const newData: Record<string, string> = {};
    filteredWorkers.forEach((worker) => {
      newData[worker.id] = 'Present';
    });
    setAttendanceData(newData);
  }

  // Filter workers
  const filteredWorkers = workers?.filter((worker) => {
    const matchesSearch = worker.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSite = filterSite === 'all' || worker.site_id === filterSite;
    const matchesType = filterType === 'all' || worker.worker_type === filterType;
    return matchesSearch && matchesSite && matchesType;
  }) || [];

  // Calculate stats for today
  const todayStats = attendanceRecords?.reduce(
    (acc, record) => {
      acc[record.status.toLowerCase()]++;
      acc.total++;
      return acc;
    },
    { present: 0, absent: 0, leave: 0, total: 0 }
  ) || { present: 0, absent: 0, leave: 0, total: 0 };

  if (loadingWorkers) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSupervisor && 'Mark attendance for your site workers'}
            {isSecretary && 'Mark attendance for office staff'}
            {isManagement && 'View and manage all attendance records'}
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
      {isManagement && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-3xl font-bold mt-1">{todayStats.total}</p>
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
                  <p className="text-3xl font-bold mt-1 text-chart-3">{todayStats.present}</p>
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
                  <p className="text-3xl font-bold mt-1 text-destructive">{todayStats.absent}</p>
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
                  <p className="text-3xl font-bold mt-1 text-chart-2">{todayStats.leave}</p>
                </div>
                <Coffee className="h-8 w-8 text-chart-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={markingMode} onValueChange={(v) => setMarkingMode(v as 'mark' | 'view')}>
        <TabsList>
          <TabsTrigger value="mark" data-testid="tab-mark">Mark Attendance</TabsTrigger>
          {isManagement && <TabsTrigger value="view" data-testid="tab-view">View Records</TabsTrigger>}
        </TabsList>

        <TabsContent value="mark" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle>Mark Attendance</CardTitle>
                <CardDescription>Select status for each worker</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={markAllPresent} data-testid="button-mark-all-present">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark All Present
                </Button>
                <Button onClick={submitAttendance} disabled={Object.keys(attendanceData).length === 0} data-testid="button-submit-attendance">
                  Submit Attendance ({Object.keys(attendanceData).length})
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
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
                {isManagement && sites && (
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
                {isManagement && (
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
                )}
              </div>

              {/* Worker List */}
              <div className="space-y-2">
                {filteredWorkers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No workers found
                  </div>
                ) : (
                  filteredWorkers.map((worker) => {
                    const currentStatus = attendanceData[worker.id];
                    const alreadyMarked = attendanceRecords?.some((r) => r.worker_id === worker.id);

                    return (
                      <div
                        key={worker.id}
                        className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-md border ${
                          alreadyMarked ? 'bg-muted/50 opacity-60' : 'bg-card'
                        }`}
                        data-testid={`worker-row-${worker.id}`}
                      >
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-medium">{worker.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {worker.sites?.site_name || 'No site'}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {worker.worker_type}
                            </Badge>
                            {worker.worker_type === 'grounds' && worker.portfolios && (
                              <span className="text-xs text-muted-foreground">
                                {worker.portfolios.portfolio_name}
                              </span>
                            )}
                            {worker.worker_type === 'office' && worker.positions && (
                              <span className="text-xs text-muted-foreground">
                                {worker.positions.position_name}
                              </span>
                            )}
                          </div>
                          {alreadyMarked && (
                            <p className="text-xs text-muted-foreground mt-1">Already marked for this date</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={currentStatus === 'Present' ? 'default' : 'outline'}
                            onClick={() => markAttendance(worker.id, 'Present')}
                            disabled={alreadyMarked}
                            data-testid={`button-present-${worker.id}`}
                            className="min-w-[80px]"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Present
                          </Button>
                          <Button
                            size="sm"
                            variant={currentStatus === 'Absent' ? 'destructive' : 'outline'}
                            onClick={() => markAttendance(worker.id, 'Absent')}
                            disabled={alreadyMarked}
                            data-testid={`button-absent-${worker.id}`}
                            className="min-w-[80px]"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Absent
                          </Button>
                          <Button
                            size="sm"
                            variant={currentStatus === 'Leave' ? 'secondary' : 'outline'}
                            onClick={() => markAttendance(worker.id, 'Leave')}
                            disabled={alreadyMarked}
                            data-testid={`button-leave-${worker.id}`}
                            className="min-w-[80px]"
                          >
                            <Coffee className="h-4 w-4 mr-1" />
                            Leave
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isManagement && (
          <TabsContent value="view" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Records</CardTitle>
                <CardDescription>View all attendance records for {selectedDate}</CardDescription>
              </CardHeader>
              <CardContent>
                {!attendanceRecords || attendanceRecords.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No attendance records for this date
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
                            Status
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRecords.map((record, idx) => (
                          <tr
                            key={record.id}
                            className={idx % 2 === 0 ? 'bg-muted/30' : ''}
                            data-testid={`attendance-record-${record.id}`}
                          >
                            <td className="py-3 px-4">{record.workers?.name}</td>
                            <td className="py-3 px-4">{record.sites?.site_name}</td>
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
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
