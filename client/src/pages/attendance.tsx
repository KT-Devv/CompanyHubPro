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
    queryKey: ['/api/workers', userRole],
    queryFn: async () => {
      let query = supabase.from('workers').select('*, portfolios(portfolio_name), positions(position_name)');

      // Supervisors can see all workers (both office and grounds)
      if (isSecretary) {
        query = query.eq('worker_type', 'office');
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch sites for site selection (used for both office and grounds workers when Present)
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
    queryKey: ['/api/attendance', selectedDate, userRole],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*, workers(name), sites(site_name)')
        .eq('date', selectedDate);

      // Supervisors can see all attendance records
      // Only secretaries are filtered to office workers
      if (isSecretary) {
        query = query.eq('worker_type', 'office');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    // Auto-refresh attendance records
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Immediately submit attendance for a single worker (records current timestamp on insert)
  async function markAttendance(workerId: string, status: string) {
    const worker = workers?.find((w) => w.id === workerId);
    if (!worker) return;

    // Require site selection for both office and grounds workers when Present
    if (status === 'Present' && !selectedSiteByWorker[workerId]) {
      toast({
        title: "Site required",
        description: `Select a site for ${worker.name} before marking Present`,
        variant: "destructive",
      });
      return;
    }

    // Site is only required when Present; for Absent/Leave it can be null
    const chosenSiteId = status === 'Present' ? selectedSiteByWorker[workerId] : null;

    try {
      const { error } = await supabase.from('attendance').insert({
        worker_id: workerId,
        site_id: chosenSiteId,
        date: selectedDate,
        status,
        marked_by: userId,
        worker_type: worker.worker_type,
      });
      if (error) throw error;

      toast({
        title: "Attendance recorded",
        description: `${worker.name} marked ${status}`,
      });

      // Clear per-worker site selection only after successful submit
      setSelectedSiteByWorker((prev) => {
        const next = { ...prev };
        delete next[workerId];
        return next;
      });

      refetchAttendance();
    } catch (error: any) {
      // Handle duplicate (already marked) or other errors
      toast({
        title: "Could not record attendance",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
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
            {isSupervisor && 'Mark attendance for all workers - select site when Present'}
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
            <CardDescription className="text-xs sm:text-sm">Click a status to record instantly</CardDescription>
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
                        <Badge variant="outline" className="text-xs">Daily site selection</Badge>
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
                    {/* Site selector for all workers (when Present) */}
                    {!alreadyMarked && (
                      <div className="w-full sm:w-56">
                        <Select
                          value={selectedSiteByWorker[worker.id] || ''}
                          onValueChange={(val) =>
                            setSelectedSiteByWorker((prev) => ({ ...prev, [worker.id]: val }))
                          }
                        >
                          <SelectTrigger className="w-full" data-testid={`select-site-${worker.id}`}>
                            <SelectValue placeholder="Select site (required for Present)" />
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
                        variant={'outline'}
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
                        variant={'outline'}
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
                        variant={'outline'}
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
