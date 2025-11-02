import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Search, Calendar, Calculator, Plus, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isSameMonth, isSameYear, getDaysInMonth } from 'date-fns';
import type { Worker, Site } from '@shared/schema';

interface SalaryCalculation {
  workerId: string;
  workerName: string;
  workerType: string;
  siteName: string;
  rate: number;
  daysPresent: number;
  baseSalary: number;
  advances: number;
  loans: number;
  finalSalary: number;
  isFixed: boolean;
}

export default function SalariesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return format(now, 'yyyy-MM');
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showLoanDialog, setShowLoanDialog] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  // Parse selected month
  const selectedDate = new Date(selectedMonth + '-01');
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const isCurrentMonth = isSameMonth(selectedDate, now) && isSameYear(selectedDate, now);
  const monthName = format(selectedDate, 'MMMM yyyy');
  
  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['/api/sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').order('site_name');
      if (error) throw error;
      return data as Site[];
    },
  });

  // Fetch workers with their rates from portfolios and positions
  const { data: workers, isLoading: loadingWorkers } = useQuery({
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

  // Fetch attendance records for the month
  const { data: attendanceRecords, isLoading: loadingAttendance } = useQuery({
    queryKey: ['/api/attendance-salary', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('worker_id, date, status')
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
        .eq('status', 'Present');
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch salary advances for the month
  const { data: advances } = useQuery({
    queryKey: ['/api/salary-advances', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_advances')
        .select('*')
        .eq('month', selectedMonth);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch loans for the month
  const { data: loans } = useQuery({
    queryKey: ['/api/loans', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('month', selectedMonth);
      if (error) throw error;
      return data as any[];
    },
  });

  // Calculate salaries
  const salaryCalculations = useMemo(() => {
    if (!workers) return [];

    const calculations: SalaryCalculation[] = [];

    workers.forEach((worker: any) => {
      if (worker.worker_type === 'grounds') {
        // Ground workers: Calculate based on days present × portfolio rate
        const daysPresent = attendanceRecords?.filter(
          (record) => record.worker_id === worker.id
        ).length || 0;

        const rate = worker.portfolios?.rate || 0;
        const baseSalary = daysPresent * rate;
        
        // Get advances and loans for this worker this month
        const workerAdvances = advances?.filter(a => a.worker_id === worker.id)
          .reduce((sum, a) => sum + a.amount, 0) || 0;
        const workerLoans = loans?.filter(l => l.worker_id === worker.id)
          .reduce((sum, l) => sum + l.amount, 0) || 0;
        
        const finalSalary = Math.max(0, baseSalary - workerAdvances - workerLoans);

        calculations.push({
          workerId: worker.id,
          workerName: worker.name,
          workerType: worker.worker_type,
          siteName: worker.sites?.site_name || '-',
          rate: rate,
          daysPresent: daysPresent,
          baseSalary: baseSalary,
          advances: workerAdvances,
          loans: workerLoans,
          finalSalary: isCurrentMonth ? baseSalary : finalSalary, // Only show deductions at month end
          isFixed: false,
        });
      } else if (worker.worker_type === 'office') {
        // Office workers: Fixed monthly salary from position
        const baseSalary = worker.positions?.rate || 0;
        
        // Get advances and loans for this worker this month
        const workerAdvances = advances?.filter(a => a.worker_id === worker.id)
          .reduce((sum, a) => sum + a.amount, 0) || 0;
        const workerLoans = loans?.filter(l => l.worker_id === worker.id)
          .reduce((sum, l) => sum + l.amount, 0) || 0;
        
        const finalSalary = Math.max(0, baseSalary - workerAdvances - workerLoans);
        
        calculations.push({
          workerId: worker.id,
          workerName: worker.name,
          workerType: worker.worker_type,
          siteName: worker.sites?.site_name || '-',
          rate: baseSalary,
          daysPresent: 0,
          baseSalary: baseSalary,
          advances: workerAdvances,
          loans: workerLoans,
          finalSalary: isCurrentMonth ? baseSalary : finalSalary, // Only show deductions at month end
          isFixed: true,
        });
      }
    });

    return calculations;
  }, [workers, attendanceRecords, advances, loans, isCurrentMonth]);

  // Filter calculations
  const filteredCalculations = useMemo(() => {
    let filtered = salaryCalculations;

    if (searchQuery) {
      filtered = filtered.filter((calc) =>
        calc.workerName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterSite !== 'all') {
      filtered = filtered.filter((calc) => {
        const worker = workers?.find((w: any) => w.id === calc.workerId);
        return worker?.site_id === filterSite;
      });
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((calc) => calc.workerType === filterType);
    }

    return filtered;
  }, [salaryCalculations, searchQuery, filterSite, filterType, workers]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredCalculations.reduce(
      (acc, calc) => {
        if (!calc.isFixed) {
          acc.totalDays += calc.daysPresent;
        }
        acc.totalSalary += isCurrentMonth ? calc.baseSalary : calc.finalSalary;
        acc.totalAdvances += calc.advances;
        acc.totalLoans += calc.loans;
        acc.totalWorkers += 1;
        return acc;
      },
      { totalDays: 0, totalSalary: 0, totalAdvances: 0, totalLoans: 0, totalWorkers: 0 }
    );
  }, [filteredCalculations, isCurrentMonth]);

  // Mutations for adding advances and loans
  const addAdvanceMutation = useMutation({
    mutationFn: async (data: { workerId: string; amount: number; date: string; notes?: string }) => {
      const { error } = await supabase.from('salary_advances').insert({
        worker_id: data.workerId,
        amount: data.amount,
        month: selectedMonth,
        date: data.date,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-advances', selectedMonth] });
      setShowAdvanceDialog(false);
      toast({ title: 'Success', description: 'Salary advance added successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const addLoanMutation = useMutation({
    mutationFn: async (data: { workerId: string; amount: number; date: string; notes?: string }) => {
      const { error } = await supabase.from('loans').insert({
        worker_id: data.workerId,
        amount: data.amount,
        month: selectedMonth,
        date: data.date,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/loans', selectedMonth] });
      setShowLoanDialog(false);
      toast({ title: 'Success', description: 'Loan added successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleExport = () => {
    const headers = ['Worker Name', 'Type', 'Site', 'Rate/Monthly Salary', 'Days Present', 'Base Salary', 'Advances', 'Loans', 'Final Salary'];
    const rows = filteredCalculations.map((calc) => [
      calc.workerName,
      calc.workerType,
      calc.siteName,
      calc.rate.toString(),
      calc.isFixed ? 'Fixed' : calc.daysPresent.toString(),
      calc.baseSalary.toString(),
      calc.advances.toString(),
      calc.loans.toString(),
      isCurrentMonth ? calc.baseSalary.toString() : calc.finalSalary.toString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salaries_${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({ title: 'Export successful', description: 'Salary data has been exported to CSV' });
  };

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy'),
      });
    }
    return options;
  }, [now]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Salaries Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calculate worker salaries with advances and loans
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]" data-testid="select-month">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Workers</p>
                <p className="text-3xl font-bold mt-1">{totals.totalWorkers}</p>
              </div>
              <Calculator className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isCurrentMonth ? 'Base Salary' : 'Final Salary'}
                </p>
                <p className="text-3xl font-bold mt-1 text-chart-1">
                  ₵{totals.totalSalary.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-chart-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Deductions</p>
                <p className="text-3xl font-bold mt-1 text-destructive">
                  ₵{(totals.totalAdvances + totals.totalLoans).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salary Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Salary Calculations</CardTitle>
              <CardDescription>
                Salaries for the month {monthName}
                {isCurrentMonth && ' (in progress - totals shown without deductions)'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Advance
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Salary Advance</DialogTitle>
                    <DialogDescription>Record a salary advance for {monthName}</DialogDescription>
                  </DialogHeader>
                  <AddAdvanceForm
                    workers={workers || []}
                    selectedMonth={selectedMonth}
                    onSubmit={(data) => {
                      addAdvanceMutation.mutate(data);
                    }}
                  />
                </DialogContent>
              </Dialog>
              <Dialog open={showLoanDialog} onOpenChange={setShowLoanDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Loan
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Loan</DialogTitle>
                    <DialogDescription>Record a loan for {monthName}</DialogDescription>
                  </DialogHeader>
                  <AddLoanForm
                    workers={workers || []}
                    selectedMonth={selectedMonth}
                    onSubmit={(data) => {
                      addLoanMutation.mutate(data);
                    }}
                  />
                </DialogContent>
              </Dialog>
              <Button onClick={handleExport} variant="outline" data-testid="button-export">
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
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
                <SelectTrigger className="w-[200px]" data-testid="select-filter-site">
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
              <SelectTrigger className="w-[200px]" data-testid="select-filter-type">
                <SelectValue placeholder="Worker type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="grounds">Grounds</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingWorkers || loadingAttendance ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : filteredCalculations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No salary calculations found for the selected month and filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Worker Name
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Site
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Rate/Monthly (₵)
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Days
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Base Salary (₵)
                    </th>
                    {!isCurrentMonth && (
                      <>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Advances (₵)
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Loans (₵)
                        </th>
                      </>
                    )}
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {isCurrentMonth ? 'Salary (₵)' : 'Final Salary (₵)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalculations.map((calc, idx) => (
                    <tr
                      key={calc.workerId}
                      className={idx % 2 === 0 ? 'bg-muted/30' : ''}
                      data-testid={`salary-row-${calc.workerId}`}
                    >
                      <td className="py-3 px-4 font-medium">{calc.workerName}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {calc.workerType}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">{calc.siteName}</td>
                      <td className="py-3 px-4">₵{calc.rate.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        {calc.isFixed ? (
                          <span className="text-muted-foreground italic">Fixed</span>
                        ) : (
                          calc.daysPresent
                        )}
                      </td>
                      <td className="py-3 px-4">₵{calc.baseSalary.toLocaleString()}</td>
                      {!isCurrentMonth && (
                        <>
                          <td className="py-3 px-4">
                            {calc.advances > 0 ? (
                              <span className="text-destructive">-₵{calc.advances.toLocaleString()}</span>
                            ) : (
                              '₵0'
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {calc.loans > 0 ? (
                              <span className="text-destructive">-₵{calc.loans.toLocaleString()}</span>
                            ) : (
                              '₵0'
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4 font-semibold">
                        ₵{(isCurrentMonth ? calc.baseSalary : calc.finalSalary).toLocaleString()}
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

function AddAdvanceForm({ workers, selectedMonth, onSubmit }: { workers: any[]; selectedMonth: string; onSubmit: (data: any) => void }) {
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount) {
      return;
    }
    onSubmit({ workerId, amount: parseInt(amount), date, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="worker">Worker</Label>
        <Select value={workerId} onValueChange={setWorkerId} required>
          <SelectTrigger>
            <SelectValue placeholder="Select worker" />
          </SelectTrigger>
          <SelectContent>
            {workers.map((worker) => (
              <SelectItem key={worker.id} value={worker.id}>
                {worker.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="amount">Amount (₵)</Label>
        <Input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="1"
        />
      </div>
      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
      <Button type="submit" className="w-full">Add Advance</Button>
    </form>
  );
}

function AddLoanForm({ workers, selectedMonth, onSubmit }: { workers: any[]; selectedMonth: string; onSubmit: (data: any) => void }) {
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount) {
      return;
    }
    onSubmit({ workerId, amount: parseInt(amount), date, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="worker">Worker</Label>
        <Select value={workerId} onValueChange={setWorkerId} required>
          <SelectTrigger>
            <SelectValue placeholder="Select worker" />
          </SelectTrigger>
          <SelectContent>
            {workers.map((worker) => (
              <SelectItem key={worker.id} value={worker.id}>
                {worker.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="amount">Amount (₵)</Label>
        <Input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="1"
        />
      </div>
      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
      <Button type="submit" className="w-full">Add Loan</Button>
    </form>
  );
}

