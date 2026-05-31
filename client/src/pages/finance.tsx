import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { AddAdvanceForm, AddLoanForm, AddDeductionForm } from '@/components/finance-forms';
import { DollarSign, Search, Calendar, Calculator, ArrowUpDown, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isSameMonth, isSameYear } from 'date-fns';

interface SalaryCalculation {
  workerId: string;
  workerName: string;
  workerType: string;
  siteName: string;
  portfolio: string;
  rate: number;
  daysPresent: number;
  baseSalary: number;
  ssnit: number;
  tax: number;
  advances: number;
  loans: number;
  deductions: number;
  finalSalary: number;
  isFixed: boolean;
  accountLocation: string;
  accountNumber: string;
}

export default function FinancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const isCeo = userRole === 'ceo';
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() => format(now, 'yyyy-MM'));
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showLoanDialog, setShowLoanDialog] = useState(false);
  const [showDeductionDialog, setShowDeductionDialog] = useState(false);

  const selectedDate = new Date(selectedMonth + '-01');
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const isCurrentMonth = isSameMonth(selectedDate, now) && isSameYear(selectedDate, now);
  const monthName = format(selectedDate, 'MMMM yyyy');

  const { data: workers, isLoading: loadingWorkers } = useQuery({
    queryKey: ['/api/workers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('*, portfolios(portfolio_name, rate), positions(position_name, rate), sites!site_id(site_name), account_site:sites!account_location(site_name)')
        .order('name');
      if (error) throw error;
      return data as any[];
    },
    refetchOnMount: 'always',
  });

  const { data: attendanceRecords, isLoading: loadingAttendance } = useQuery({
    queryKey: ['/api/attendance-salary', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('worker_id, date, status')
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
        .in('status', ['Present', 'Half Day']);
      if (error) throw error;
      return data as any[];
    },
    refetchOnMount: 'always',
  });

  const { data: advances } = useQuery({
    queryKey: ['/api/salary-advances', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('salary_advances').select('*').eq('month', selectedMonth);
      if (error) throw error;
      return data as any[];
    },
    refetchOnMount: 'always',
  });

  const { data: loans } = useQuery({
    queryKey: ['/api/loans', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('loans').select('*').eq('month', selectedMonth);
      if (error) throw error;
      return data as any[];
    },
    refetchOnMount: 'always',
  });

  const { data: globalDeductions } = useQuery({
    queryKey: ['/api/deductions', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('deductions').select('*').eq('month', selectedMonth);
      if (error) throw error;
      return data as any[];
    },
    refetchOnMount: 'always',
  });

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

  const addDeductionMutation = useMutation({
    mutationFn: async (data: { workerId: string; amount: number; date: string; notes?: string }) => {
      const { error } = await supabase.from('deductions').insert({
        worker_id: data.workerId,
        amount: data.amount,
        month: selectedMonth,
        date: data.date,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deductions', selectedMonth] });
      setShowDeductionDialog(false);
      toast({ title: 'Success', description: 'Deduction added successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const salaryCalculations = useMemo(() => {
    if (!workers) return [];
    const calculations: SalaryCalculation[] = [];

    workers.forEach((worker: any) => {
      let baseSalary = 0;
      let daysPresent = 0;
      let rate = 0;
      let isFixed = false;
      let portfolio = '-';

      if (worker.worker_type === 'casual') {
        daysPresent = attendanceRecords
          ?.filter((record) => record.worker_id === worker.id)
          .reduce((sum, record) => {
            if (record.status === 'Present') return sum + 1;
            if (record.status === 'Half Day') return sum + 0.5;
            return sum;
          }, 0) || 0;

        rate = worker.portfolios?.rate || 0;
        portfolio = worker.portfolios?.portfolio_name || '-';
        baseSalary = daysPresent * rate;
      } else if (worker.worker_type === 'non_marking') {
        rate = worker.positions?.rate || 0;
        portfolio = worker.positions?.position_name || '-';
        baseSalary = rate;
        isFixed = true;
      }

      const workerAdvances = advances?.filter(a => a.worker_id === worker.id).reduce((sum, a) => sum + a.amount, 0) || 0;
      const workerLoans = loans?.filter(l => l.worker_id === worker.id).reduce((sum, l) => sum + l.amount, 0) || 0;
      const workerDeductions = globalDeductions?.filter(d => d.worker_id === worker.id).reduce((sum, d) => sum + d.amount, 0) || 0;
      
      // Calculate SSNIT and Taxes algorithmically (e.g. 5.5% SSNIT, 10% TAX on remainder)
      const ssnit = baseSalary * 0.055;
      const taxableAmount = baseSalary - ssnit;
      const tax = taxableAmount > 0 ? taxableAmount * 0.10 : 0;
      
      const totalDeductions = ssnit + tax + workerAdvances + workerLoans + workerDeductions;
      const finalSalary = Math.max(0, baseSalary - totalDeductions);

      // We determine account location correctly handling the alias if available
      // The query aliased account_site to sites!workers_account_location_fkey
      const acctLocName = worker.account_site?.site_name || '-';

      calculations.push({
        workerId: worker.id,
        workerName: worker.name,
        workerType: worker.worker_type,
        siteName: worker.sites?.site_name || 'N/A',
        portfolio,
        rate,
        daysPresent,
        baseSalary,
        ssnit,
        tax,
        advances: workerAdvances,
        loans: workerLoans,
        deductions: workerDeductions,
        finalSalary: isCurrentMonth ? baseSalary : finalSalary,
        isFixed,
        accountLocation: acctLocName,
        accountNumber: worker.account_number || '-',
      });
    });

    return calculations;
  }, [workers, attendanceRecords, advances, loans, globalDeductions, isCurrentMonth]);

  const filteredCalculations = useMemo(() => {
    let filtered = salaryCalculations;
    if (searchQuery) {
      filtered = filtered.filter((calc) => calc.workerName.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterType !== 'all') {
      filtered = filtered.filter((calc) => calc.workerType === filterType);
    }
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn as keyof SalaryCalculation];
        let bVal: any = b[sortColumn as keyof SalaryCalculation];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    }
    return filtered;
  }, [salaryCalculations, searchQuery, filterType, sortColumn, sortDirection]);

  const handleExport = () => {
    let headers;
    let rows;
    
    if (isCeo) {
      headers = ['Worker Name', 'Site', 'Portfolio', 'Rate', 'Days Present', 'Total Salary'];
      rows = filteredCalculations.map((calc) => [
        calc.workerName,
        calc.siteName,
        calc.portfolio,
        calc.rate.toString(),
        calc.isFixed ? 'Fixed' : calc.daysPresent.toString(),
        (isCurrentMonth ? calc.baseSalary : calc.finalSalary).toFixed(2),
      ]);
    } else {
      headers = ['Worker Name', 'Site', 'Portfolio', 'Rate', 'Days Present', 'Base Salary', 'SSNIT', 'Tax', 'Advances', 'Loans', 'Other Deductions', 'Final Salary', 'Account Location', 'Account Number'];
      rows = filteredCalculations.map((calc) => [
        calc.workerName,
        calc.siteName,
        calc.portfolio,
        calc.rate.toString(),
        calc.isFixed ? 'Fixed' : calc.daysPresent.toString(),
        calc.baseSalary.toFixed(2),
        calc.ssnit.toFixed(2),
        calc.tax.toFixed(2),
        calc.advances.toString(),
        calc.loans.toString(),
        calc.deductions.toString(),
        (isCurrentMonth ? calc.baseSalary : calc.finalSalary).toFixed(2),
        calc.accountLocation,
        calc.accountNumber,
      ]);
    }

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_schedule_${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast({ title: 'Export successful', description: 'Finance schedule has been exported to CSV' });
  };

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') });
    }
    return options;
  }, [now]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/30" onClick={() => handleSort(column)}>
      <div className="flex items-center gap-2">
        {label}
        {sortColumn === column ? (sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-30" />}
      </div>
    </th>
  );

  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Finance Portal</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage comprehensive salary schedules and deductions</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hidden sm:block" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Select month" /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">Salary Schedule</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Comprehensive breakdown for {monthName}</CardDescription>
            </div>
            <div className="flex gap-2">
              {!isCeo && (
                <>
                  <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Advance
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Salary Advance</DialogTitle>
                        <DialogDescription>Record a salary advance for {monthName}</DialogDescription>
                      </DialogHeader>
                      <AddAdvanceForm workers={workers || []} selectedMonth={selectedMonth} onSubmit={(data) => addAdvanceMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                  <Dialog open={showLoanDialog} onOpenChange={setShowLoanDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Loan
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Loan</DialogTitle>
                        <DialogDescription>Record a loan for {monthName}</DialogDescription>
                      </DialogHeader>
                      <AddLoanForm workers={workers || []} selectedMonth={selectedMonth} onSubmit={(data) => addLoanMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                  <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Deduction
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Deduction</DialogTitle>
                        <DialogDescription>Record a custom deduction for {monthName}</DialogDescription>
                      </DialogHeader>
                      <AddDeductionForm workers={workers || []} selectedMonth={selectedMonth} onSubmit={(data) => addDeductionMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                </>
              )}
              <Button onClick={handleExport} variant="outline" size="sm">Export CSV</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 w-full sm:min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search workers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Worker type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="non_marking">Non-Marking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingWorkers || loadingAttendance ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filteredCalculations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No data found</div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="w-full min-w-[1200px]">
                  <thead>
                    <tr className="border-b">
                      <SortHeader column="workerName" label="Name" />
                      <SortHeader column="siteName" label="Site" />
                      <SortHeader column="portfolio" label="Portfolio" />
                      {!isCeo && (
                        <>
                          <SortHeader column="accountLocation" label="Acct Loc" />
                          <SortHeader column="accountNumber" label="Acct No." />
                        </>
                      )}
                      <SortHeader column="daysPresent" label="Days" />
                      <SortHeader column="rate" label="Rate(₵)" />
                      {!isCeo && <SortHeader column="baseSalary" label="Base(₵)" />}
                      {!isCurrentMonth && !isCeo && (
                        <>
                          <SortHeader column="ssnit" label="SSNIT(₵)" />
                          <SortHeader column="tax" label="Tax(₵)" />
                          <SortHeader column="advances" label="Adv(₵)" />
                          <SortHeader column="loans" label="Loans(₵)" />
                          <SortHeader column="deductions" label="Dedt(₵)" />
                        </>
                      )}
                      <SortHeader column="finalSalary" label={isCurrentMonth && !isCeo ? 'Salary(₵)' : 'Total(₵)'} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCalculations.map((calc, idx) => (
                      <tr key={calc.workerId} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 font-medium text-sm">{calc.workerName}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{calc.siteName}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{calc.portfolio}</td>
                        {!isCeo && (
                          <>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{calc.accountLocation}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{calc.accountNumber}</td>
                          </>
                        )}
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">{calc.isFixed ? <span className="text-muted-foreground italic">Fixed</span> : calc.daysPresent}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">₵{calc.rate.toLocaleString()}</td>
                        {!isCeo && <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm">₵{calc.baseSalary.toFixed(2)}</td>}
                        {!isCurrentMonth && !isCeo && (
                          <>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm text-destructive">-₵{calc.ssnit.toFixed(2)}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm text-destructive">-₵{calc.tax.toFixed(2)}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm text-destructive">-₵{calc.advances.toFixed(2)}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm text-destructive">-₵{calc.loans.toFixed(2)}</td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-sm text-destructive">-₵{calc.deductions.toFixed(2)}</td>
                          </>
                        )}
                        <td className="py-2 sm:py-3 px-2 sm:px-4 font-semibold text-sm">₵{(isCurrentMonth ? calc.baseSalary : calc.finalSalary).toFixed(2)}</td>
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



