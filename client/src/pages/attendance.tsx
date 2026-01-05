import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle2, XCircle, Coffee, Search, Plus, AlertCircle, Loader2, Clock, Check } from 'lucide-react';
import { format } from 'date-fns';
import type { Worker, Attendance } from '@shared/schema';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AttendancePage() {
  const { userRole, userId, userSiteId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [openCrossSiteDialog, setOpenCrossSiteDialog] = useState(false);
  const [crossSiteQuery, setCrossSiteQuery] = useState('');
  const [crossSiteResults, setCrossSiteResults] = useState<any[]>([]);
  const [isSearchingCrossSite, setIsSearchingCrossSite] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState<string | null>(null);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState<string | null>(null); // Track which worker is being updated
  const [confirmDialog, setConfirmDialog] = useState<{ workerId: string; status: string; fromCrossSite: boolean } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmHalfDayDialog, setConfirmHalfDayDialog] = useState<any | null>(null);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [multiConfirmDialog, setMultiConfirmDialog] = useState(false);

  const isSupervisor = userRole === 'supervisor';
  const isSecretary = userRole === 'secretary';

  // Fetch workers based on role
  const { data: workers, isLoading: loadingWorkers } = useQuery({
    queryKey: ['/api/workers', userRole, userSiteId],
    queryFn: async () => {
      let query = supabase.from('workers').select('*, portfolios(portfolio_name, id), positions(position_name, id), sites(site_name, id)');

      // Secretaries can only see office workers
      if (isSecretary) {
        query = query.eq('worker_type', 'office');
      }

      const { data: workersData, error: workersError } = await query.order('name');
      if (workersError) throw workersError;

      // For supervisors, filter workers - only show those assigned to their site
      let filteredWorkers = (workersData || []);
      if (isSupervisor && userSiteId) {
        filteredWorkers = filteredWorkers.filter((w: any) => w.site_id === userSiteId);
      }

      return filteredWorkers;
    },
  });

  // Fetch attendance records for selected date (role-scoped)
  const { data: attendanceRecords, refetch: refetchAttendance } = useQuery({
    queryKey: ['/api/attendance', selectedDate, userRole],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate);

      const { data, error } = await query;
      if (error) {
        console.error('Attendance fetch error:', error);
        throw error;
      }
      
      // Filter on client side for secretaries
      if (isSecretary && data) {
        return (data as any[]).filter(record => record.worker_type === 'office');
      }
      
      return data as any[];
    },
    // Auto-refresh attendance records
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Mutation for marking/updating attendance (single)
  const { mutate: markAttendance, isPending: isMarking } = useMutation({
    mutationFn: async ({ worker, status }: { worker: any; status: string }) => {
      const existingRecord = attendanceRecords?.find(r => r.worker_id === worker.id);
      const record = {
        worker_id: worker.id,
        date: selectedDate,
        status: status,
        marked_by: userId,
        worker_type: worker.worker_type,
      };

      // Use upsert to either insert a new record or update an existing one based on worker_id and date
      // Note: This requires a UNIQUE constraint on (worker_id, date) in your 'attendance' table.
      const { error } = await supabase.from('attendance').upsert(record, {
        onConflict: 'worker_id, date',
      });

      if (error) throw error;
      return { worker, status };
    },
    onSuccess: ({ worker, status }) => {
      toast({
        title: 'Attendance Recorded',
        description: `${worker.name} marked as ${status}.`,
      });
      setIsConfirmed(true);
      setTimeout(() => {
        setConfirmDialog(null);
        setIsConfirmed(false);
        if (openCrossSiteDialog) {
          setOpenCrossSiteDialog(false);
          setCrossSiteQuery('');
          setCrossSiteResults([]);
        }
      }, 1500);
      queryClient.invalidateQueries({ queryKey: ['/api/attendance', selectedDate, userRole] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance-management', selectedDate] });
    },
    onError: (error: any) => {
      toast({ title: 'Could not record attendance', description: error.message, variant: 'destructive' });
    },
    onSettled: () => {
      setIsMarkingAttendance(null);
    },
  });

  // Batch mark multiple workers as Present
  const { mutate: markMultiple, isPending: isMarkingMultiple } = useMutation({
    mutationFn: async (workerIds: string[]) => {
      const toMark = (workerIds || []).filter(id => !attendanceRecords?.some(r => r.worker_id === id));
      if (!toMark || toMark.length === 0) throw new Error('Selected workers are already marked for this date');

      const records = toMark.map((id) => {
        const worker = workers?.find((w: any) => w.id === id);
        return {
          worker_id: id,
          date: selectedDate,
          status: 'Present',
          marked_by: userId,
          worker_type: worker?.worker_type,
        };
      });

      const { error } = await supabase.from('attendance').upsert(records, { onConflict: 'worker_id, date' });
      if (error) throw error;
      return toMark;
    },
    onSuccess: (markedIds: string[]) => {
      toast({ title: 'Attendance Recorded', description: `${markedIds.length} worker(s) marked as Present.` });
      setSelectedWorkers([]);
      setMultiConfirmDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/attendance', selectedDate, userRole] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance-management', selectedDate] });
    },
    onError: (error: any) => {
      toast({ title: 'Could not record attendance', description: error.message, variant: 'destructive' });
    },
  });

  const handleMarkAttendance = (workerId: string, status: string, fromCrossSite: boolean = false) => {
    setIsMarkingAttendance(workerId);
    const worker = fromCrossSite ? crossSiteResults.find(w => w.id === workerId) : workers?.find((w: { id: string; }) => w.id === workerId);
    if (worker) markAttendance({ worker, status });
  };

  // Update attendance status to "Half Day"
  const { mutate: markHalfDay, isPending: isMarkingHalfDay } = useMutation({
    mutationFn: async (attendanceRecord: any) => {
      if (!attendanceRecord) throw new Error('No attendance record provided');
      if (attendanceRecord.status !== 'Present') {
        throw new Error('Can only mark "Present" workers as "Half Day".');
      }
      setIsUpdatingAttendance(attendanceRecord.worker_id);

      // Update and return the updated row so we can update cache immediately
      const { data: updatedRow, error } = await supabase
        .from('attendance')
        .update({ status: 'Half Day' })
        .eq('id', attendanceRecord.id)
        .select()
        .limit(1)
        .single();

      if (error) throw error;
      return updatedRow;
    },
    onSuccess: (updatedRow: any) => {
      setConfirmHalfDayDialog(null); // Close dialog on success
      const worker = workers?.find((w: any) => w.id === updatedRow.worker_id);
      toast({ title: 'Success', description: `${worker?.name || 'Worker'} has been marked for a half day.` });

      // Optimistically update react-query cache for attendance lists
      try {
        // Update attendance list for management page (by date)
        queryClient.setQueryData(['/api/attendance-management', selectedDate], (oldData: any) => {
          if (!oldData) return oldData;
          return (oldData as any[]).map((r) => (r.id === updatedRow.id ? { ...r, ...updatedRow } : r));
        });

        // Update supervisor view too
        queryClient.setQueryData(['/api/attendance', selectedDate, userRole], (oldData: any) => {
          if (!oldData) return oldData;
          return (oldData as any[]).map((r) => (r.id === updatedRow.id ? { ...r, ...updatedRow } : r));
        });
      } catch (e) {
        // ignore cache patch errors
      }

      // Ensure fresh data across app
      queryClient.invalidateQueries({ queryKey: ['/api/attendance', selectedDate, userRole] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance-management', selectedDate] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to mark half day', variant: 'destructive' });
    },
    onSettled: () => {
      // Always reset the loading state for the specific button after the mutation is settled.
      setIsUpdatingAttendance(null);
    }
  });

  // Search for workers from other sites
  async function searchCrossSiteWorker() {
    if (!crossSiteQuery.trim()) {
      toast({
        title: "Enter a name",
        description: "Please enter a worker name to search",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingCrossSite(true);
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*, sites(site_name, id)')
        .ilike('name', `%${crossSiteQuery}%`)
        .neq('site_id', userSiteId); // Exclude workers from user's own site

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "No results",
          description: "No workers found with that name from other sites",
        });
        setCrossSiteResults([]);
        return;
      }

      setCrossSiteResults(data as any[]);
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message || "Unable to search workers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingCrossSite(false);
    }
  }

  // Filter workers
  const filteredWorkers = workers?.filter((worker: any) => {
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
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-800">Mark Attendance</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            {isSupervisor ? '📍 Mark attendance for workers at your site' : '📋 Mark attendance for office staff'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-500 hidden sm:block" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-auto border border-gray-200 focus:border-blue-300 focus:ring-blue-300"
            data-testid="input-date"
          />
          {isSupervisor && (
            <Dialog open={openCrossSiteDialog} onOpenChange={setOpenCrossSiteDialog}>
              <Button
                size="sm"
                className="border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 shadow-sm transition-all"
                onClick={() => setOpenCrossSiteDialog(true)}
                data-testid="button-cross-site"
              >
                <Plus className="h-4 w-4 mr-2" />
                Mark Other Worker
              </Button>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Mark Attendance - Other Sites</DialogTitle>
                  <DialogDescription>
                    Search for a worker from another site by name
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="crossSiteSearch">Search by Name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="crossSiteSearch"
                        placeholder="Worker name"
                        value={crossSiteQuery}
                        onChange={(e) => setCrossSiteQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchCrossSiteWorker()}
                        disabled={isSearchingCrossSite}
                        data-testid="input-cross-site-search"
                      />
                      <Button
                        onClick={searchCrossSiteWorker}
                        disabled={isSearchingCrossSite}
                        data-testid="button-search-cross-site"
                      >
                        {isSearchingCrossSite ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {crossSiteResults.length > 0 && (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {crossSiteResults.map((worker) => {
                        const alreadyMarked = attendanceRecords?.some((r) => r.worker_id === worker.id);
                        return (
                          <div
                            key={worker.id}
                            className={`p-4 rounded-lg border transition-all ${
                              alreadyMarked ? 'bg-slate-100 border-slate-300 opacity-60' : 'bg-white border-gray-100 hover:shadow-md'
                            }`}
                            data-testid={`cross-site-worker-${worker.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div>
                                <p className="font-bold text-sm text-slate-900">{worker.name}</p>
                                <p className="text-xs text-slate-600 mt-1">
                                  📱 {worker.phone_number} • 📍 {worker.sites?.site_name}
                                </p>
                                {alreadyMarked && (
                                  <p className="text-xs text-slate-600 mt-2 font-semibold">✓ Already marked for this date</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 font-semibold"
                                  onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Present', fromCrossSite: true })}
                                  disabled={alreadyMarked || isMarkingAttendance === worker.id}
                                  data-testid={`button-cross-present-${worker.id}`}
                                >
                                  {isMarkingAttendance === worker.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                  )}
                                  Present
                                </Button>
                                <Button
                                  size="sm"
                                  className="border border-red-300 text-red-700 bg-white hover:bg-red-50 font-semibold"
                                  onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Absent', fromCrossSite: true })}
                                  disabled={alreadyMarked || isMarkingAttendance === worker.id}
                                  data-testid={`button-cross-absent-${worker.id}`}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Absent
                                </Button>
                                <Button
                                  size="sm"
                                  className="border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 font-semibold"
                                  onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Leave', fromCrossSite: true })}
                                  disabled={alreadyMarked || isMarkingAttendance === worker.id}
                                  data-testid={`button-cross-leave-${worker.id}`}
                                >
                                  <Coffee className="h-4 w-4 mr-1" />
                                  Leave
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenCrossSiteDialog(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="border border-gray-200 shadow-sm bg-white">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0 pb-4 bg-white border-b border-gray-100">
          <div>
            <CardTitle className="text-xl sm:text-2xl font-semibold text-slate-800">Mark Attendance</CardTitle>
            <CardDescription className="text-sm text-slate-600 mt-1">✓ Click a status to record instantly</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* Search Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 w-full sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search workers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 border border-gray-200 focus:border-blue-300 focus:ring-blue-300"
                  data-testid="input-search-workers"
                />
              </div>
            </div>
          </div>

          {/* Multi-select toolbar */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={filteredWorkers.length > 0 && selectedWorkers.length === filteredWorkers.length}
                onCheckedChange={(val) => {
                  if (val) setSelectedWorkers(filteredWorkers.map((w: any) => w.id));
                  else setSelectedWorkers([]);
                }}
              />
              <span className="text-sm text-slate-700">Select all</span>
            </div>
            <div>
              <Button
                size="sm"
                onClick={() => setMultiConfirmDialog(true)}
                disabled={selectedWorkers.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-mark-selected"
              >
                Mark Selected Present ({selectedWorkers.length})
              </Button>
            </div>
          </div>

          {/* Worker List */}
          <div className="space-y-2">
            {filteredWorkers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No workers found
              </div>
            ) : (
              filteredWorkers.map((worker: any) => {
                const attendanceRecord = attendanceRecords?.find((r) => r.worker_id === worker.id);
                const status = attendanceRecord?.status;

                return (
                  <div
                    key={worker.id}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-md border duration-200 hover:shadow-sm ${
                      !!status ? 'bg-muted/50' : 'bg-card hover:bg-muted/30'
                    }`}
                    data-testid={`worker-row-${worker.id}`}
                  >
                    <div className="flex-1 w-full sm:min-w-[200px]">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`select-${worker.id}`}
                          checked={selectedWorkers.includes(worker.id)}
                          onCheckedChange={(val) => {
                            if (val) setSelectedWorkers((s) => Array.from(new Set([...s, worker.id])));
                            else setSelectedWorkers((s) => s.filter((id) => id !== worker.id));
                          }}
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-sm sm:text-base text-slate-900">{worker.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs bg-gray-100 text-slate-700 border border-gray-200">
                          {worker.worker_type === 'office' ? '🏢' : '🔧'} {worker.worker_type}
                        </Badge>
                        {worker.worker_type === 'grounds' && worker.portfolios && (
                          <span className="text-xs text-slate-700 font-semibold">
                            {worker.portfolios.portfolio_name}
                          </span>
                        )}
                        {worker.worker_type === 'office' && worker.positions && (
                          <span className="text-xs text-slate-700 font-semibold">
                            {worker.positions.position_name}
                          </span>
                        )}
                        {worker.sites && (
                          <span className="text-xs text-slate-600 font-medium">
                            📍 {worker.sites.site_name}
                          </span>
                        )}
                      </div>
                      {status && (
                         <div className="mt-2">
                           <Badge
                             variant={
                               status === 'Present' ? 'default'
                               : status === 'Absent' ? 'destructive'
                               : status === 'Half Day' ? 'secondary' // Use a neutral badge and style with class
                               : 'secondary'
                             }
                             className={status === 'Half Day' ? 'bg-yellow-100 text-yellow-800' : ''}
                           >
                             Marked as {status}
                           </Badge>
                         </div>
                      )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      {!status ? (
                        <>
                          <Button
                            size="sm"
                            className="border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 font-semibold flex-1 sm:flex-none sm:min-w-[80px]"
                            onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Present', fromCrossSite: false })}
                            disabled={isMarkingAttendance === worker.id}
                            data-testid={`button-present-${worker.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Present
                          </Button>
                          <Button
                            size="sm"
                            className="border border-red-300 text-red-700 bg-white hover:bg-red-50 font-semibold flex-1 sm:flex-none sm:min-w-[80px]"
                            onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Absent', fromCrossSite: false })}
                            disabled={isMarkingAttendance === worker.id}
                            data-testid={`button-absent-${worker.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Absent
                          </Button>
                          <Button
                            size="sm"
                            className="border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 font-semibold flex-1 sm:flex-none sm:min-w-[80px]"
                            onClick={() => setConfirmDialog({ workerId: worker.id, status: 'Leave', fromCrossSite: false })}
                            disabled={isMarkingAttendance === worker.id}
                            data-testid={`button-leave-${worker.id}`}
                          >
                            <Coffee className="h-4 w-4 mr-1" /> Leave
                          </Button>
                        </>
                      ) : status === 'Present' && isSupervisor ? (
                        <Button
                          size="sm"
                          className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold flex-1 sm:flex-none shadow-sm"
                          onClick={() => setConfirmHalfDayDialog(attendanceRecord)}
                          disabled={isUpdatingAttendance === worker.id || isMarkingHalfDay}
                          data-testid={`button-half-day-${worker.id}`}
                        >
                          {isUpdatingAttendance === worker.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                          Mark as Half Day
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && !isConfirmed && setConfirmDialog(null)}>
          <DialogContent className={`max-w-sm border-2 border-blue-300 shadow-2xl`}>
            <DialogHeader>
              <DialogTitle className={`text-2xl font-bold ${isConfirmed ? 'text-green-700' : 'text-blue-700'}`}>
                {isConfirmed ? '✓ Confirmed' : '✓ Confirm Attendance'}
              </DialogTitle>
              <DialogDescription className="text-slate-600 font-semibold">
                {isConfirmed ? 'Attendance has been recorded' : 'Please confirm this attendance marking'}
              </DialogDescription>
            </DialogHeader>
            {!isConfirmed && confirmDialog && (
              <div className="space-y-4">
                <Alert className="border-2 border-yellow-400 bg-yellow-50">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-slate-900 font-semibold ml-2">
                    Mark {confirmDialog.status.toLowerCase()} for {format(new Date(selectedDate), 'MMMM dd, yyyy')}?
                  </AlertDescription>
                </Alert>
                <p className="text-sm text-slate-700 font-semibold">
                  ⚠️ This action cannot be undone. Once marked, the attendance record is locked.
                </p>
              </div>
            )}
            {isConfirmed && (
              <div className="flex justify-center py-8">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
            )}
            <DialogFooter>
              {!isConfirmed && (
                <>
                  <Button variant="outline" onClick={() => setConfirmDialog(null)} className="border-2 border-slate-300">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (confirmDialog) {
                        handleMarkAttendance(confirmDialog.workerId, confirmDialog.status, confirmDialog.fromCrossSite);
                      }
                    }}
                    disabled={isMarking}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg font-semibold"
                  >
                    {isMarking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirm
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Half Day Confirmation Dialog */}
      {confirmHalfDayDialog && (
        <Dialog open={!!confirmHalfDayDialog} onOpenChange={(open) => !open && setConfirmHalfDayDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-yellow-700">Confirm Half Day</DialogTitle>
              <DialogDescription>
                Please confirm this action. This will update the worker's status.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Alert className="border-yellow-400 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-slate-900 font-semibold ml-2">
                  Update status to "Half Day" for {workers?.find((w: any) => w.id === confirmHalfDayDialog.worker_id)?.name}?
                </AlertDescription>
              </Alert>
              <p className="text-sm text-slate-700 font-semibold">
                This will adjust the attendance record from a full day to a half day.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmHalfDayDialog(null)} disabled={isMarkingHalfDay}>
                Cancel
              </Button>
              <Button
                onClick={() => markHalfDay(confirmHalfDayDialog)}
                disabled={isMarkingHalfDay}
                className="bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg font-semibold"
              >
                {isMarkingHalfDay && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm Half Day
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Multi-select Confirmation Dialog */}
      {multiConfirmDialog && (
        <Dialog open={multiConfirmDialog} onOpenChange={(open) => !open && setMultiConfirmDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Confirm Mark Present</DialogTitle>
              <DialogDescription>
                Mark {selectedWorkers.length} selected worker(s) as Present for {format(new Date(selectedDate), 'MMMM dd, yyyy')}?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-700 font-semibold">This will record attendance for the selected workers.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMultiConfirmDialog(false)} disabled={isMarkingMultiple}>
                Cancel
              </Button>
              <Button
                onClick={() => markMultiple(selectedWorkers)}
                disabled={isMarkingMultiple}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isMarkingMultiple && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 
