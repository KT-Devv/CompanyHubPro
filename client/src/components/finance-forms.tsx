import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';

export function AddAdvanceForm({ workers, selectedMonth, onSubmit }: { workers: any[]; selectedMonth: string; onSubmit: (data: any) => void }) {
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [workerOpen, setWorkerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount) return;
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    onSubmit({ workerId, amount: parsedAmount, date, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Worker</Label>
        <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={workerOpen} className="w-full justify-between mt-1 text-left font-normal">
              {workerId ? workers.find((w) => w.id === workerId)?.name : "Select worker..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search worker..." />
              <CommandList>
                <CommandEmpty>No worker found.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-y-auto">
                  {workers.map((worker) => (
                    <CommandItem key={worker.id} value={worker.name} onSelect={() => { setWorkerId(worker.id); setWorkerOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", workerId === worker.id ? "opacity-100" : "opacity-0")} />
                      {worker.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label>Amount (₵)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" />
      </div>
      <div>
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <Button type="submit" className="w-full">Add Advance</Button>
    </form>
  );
}

export function AddLoanForm({ workers, selectedMonth, onSubmit }: { workers: any[]; selectedMonth: string; onSubmit: (data: any) => void }) {
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [workerOpen, setWorkerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount) return;
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    onSubmit({ workerId, amount: parsedAmount, date, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Worker</Label>
        <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={workerOpen} className="w-full justify-between mt-1 text-left font-normal">
              {workerId ? workers.find((w) => w.id === workerId)?.name : "Select worker..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search worker..." />
              <CommandList>
                <CommandEmpty>No worker found.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-y-auto">
                  {workers.map((worker) => (
                    <CommandItem key={worker.id} value={worker.name} onSelect={() => { setWorkerId(worker.id); setWorkerOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", workerId === worker.id ? "opacity-100" : "opacity-0")} />
                      {worker.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label>Amount (₵)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" />
      </div>
      <div>
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <Button type="submit" className="w-full">Add Loan</Button>
    </form>
  );
}

export function AddDeductionForm({ workers, selectedMonth, onSubmit }: { workers: any[]; selectedMonth: string; onSubmit: (data: any) => void }) {
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [workerOpen, setWorkerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount) return;
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    onSubmit({ workerId, amount: parsedAmount, date, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Worker</Label>
        <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={workerOpen} className="w-full justify-between mt-1 text-left font-normal">
              {workerId ? workers.find((w) => w.id === workerId)?.name : "Select worker..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search worker..." />
              <CommandList>
                <CommandEmpty>No worker found.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-y-auto">
                  {workers.map((worker) => (
                    <CommandItem key={worker.id} value={worker.name} onSelect={() => { setWorkerId(worker.id); setWorkerOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", workerId === worker.id ? "opacity-100" : "opacity-0")} />
                      {worker.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label>Amount (₵)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" />
      </div>
      <div>
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <Button type="submit" className="w-full">Add Deduction</Button>
    </form>
  );
}