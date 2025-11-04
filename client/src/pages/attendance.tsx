import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle2, XCircle, Coffee, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { Worker, Attendance } from '@shared/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AttendancePage() {
  const { userRole, userId, userSiteId } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteByWorker, setSelectedSiteByWorker] = useState<Record<string, string>>({});

  const isSupervisor = userRole === 'supervisor';
  const isSecretary = userRole === 'secretary';

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

  // Fetch sites for site selection (used by secretaries for office workers)
  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as any[];
    },
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

  // Validate site selection for office workers ONLY when marked Present
  const missingSiteFor = entries
      .map(([workerId, status]) => ({ worker: workers?.find((w) => w.id === workerId), status }))
      .filter((item) => item.worker && item.worker.worker_type === 'office' && item.status === 'Present' && !selectedSiteByWorker[item.worker.id])
      .map((item) => item.worker);

    if (missingSiteFor && missingSiteFor.length > 0) {
      const firstName = missingSiteFor[0]?.name || 'some workers';
      toast({
        title: "Site required for office workers",
        description: `Select a site for ${firstName} (and any other office workers).`,
        variant: "destructive",
      });
      return;
    }

    try {
      const attendanceEntries = entries.map(([workerId, status]) => {
        const worker = workers?.find((w) => w.id === workerId);
        const chosenSiteId =
          worker?.worker_type === 'office'
            ? (status === 'Present' ? selectedSiteByWorker[workerId] : null)
            : worker?.site_id;
        return {
          worker_id: workerId,
          site_id: chosenSiteId,
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
      setSelectedSiteByWorker({});
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
    return matchesSearch;
  }) || [];

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Mark Attendance</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isSupervisor && 'Mark attendance for your site workers'}
            {isSecretary && 'Mark attendance for office staff'}
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

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg sm:text-xl">Mark Attendance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Select status for each worker</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" onClick={markAllPresent} className="w-full sm:w-auto" data-testid="button-mark-all-present">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark All Present
            </Button>
            <Button onClick={submitAttendance} disabled={Object.keys(attendanceData).length === 0} className="w-full sm:w-auto" data-testid="button-submit-attendance">
              Submit Attendance ({Object.keys(attendanceData).length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Filter */}
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
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-md border ${
                      alreadyMarked ? 'bg-muted/50 opacity-60' : 'bg-card'
                    }`}
                    data-testid={`worker-row-${worker.id}`}
                  >
                    <div className="flex-1 w-full sm:min-w-[200px]">
                      <p className="font-medium text-sm sm:text-base">{worker.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {worker.worker_type === 'grounds' ? (
                          <Badge variant="outline" className="text-xs">
                            {worker.sites?.site_name || 'No site'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Daily site selection</Badge>
                        )}
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
                    {/* Site selector for office workers */}
                    {worker.worker_type === 'office' && !alreadyMarked && (
                      <div className="w-full sm:w-56">
                        <Select
                          value={selectedSiteByWorker[worker.id] || ''}
                          onValueChange={(val) =>
                            setSelectedSiteByWorker((prev) => ({ ...prev, [worker.id]: val }))
                          }
                        >
                          <SelectTrigger className="w-full" data-testid={`select-site-${worker.id}`}>
                            <SelectValue placeholder="Select site" />
                          </SelectTrigger>
                          <SelectContent>
                            {(sites || []).map((site: any) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.site_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant={currentStatus === 'Present' ? 'default' : 'outline'}
                        onClick={() => markAttendance(worker.id, 'Present')}
                        disabled={alreadyMarked}
                        data-testid={`button-present-${worker.id}`}
                        className="flex-1 sm:flex-none sm:min-w-[80px]"
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
                        className="flex-1 sm:flex-none sm:min-w-[80px]"
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
                        className="flex-1 sm:flex-none sm:min-w-[80px]"
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
    </div>
  );
}
