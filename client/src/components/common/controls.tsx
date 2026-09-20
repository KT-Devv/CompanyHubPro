import { useState, type ReactNode } from 'react';
import { addDays, format, subMonths } from 'date-fns';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDay, parseDay, todayISO } from '@/lib/format';
import type { SortState } from '@/lib/use-sort';

// ------------------------------------------------------------------ Field
// A labelled form control with optional hint / error text.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ SearchInput
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-ivory hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Segmented filter
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-ivory p-1 scroll-quiet', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count != null && (
              <span className={cn('num rounded-full px-1.5 text-[11px] leading-4', active ? 'bg-ivory text-foreground' : 'bg-pearl/70')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Sortable table head
export function SortHead({
  label,
  column,
  sort,
  onSort,
  className,
  align = 'left',
}: {
  label: string;
  column: string;
  sort?: SortState;
  onSort: (column: string) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === column;
  const Icon = !active ? ArrowUpDown : sort!.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

// ------------------------------------------------------------------ Month select
export function monthOptions(count = 18, from: Date = new Date()) {
  const first = new Date(from.getFullYear(), from.getMonth(), 1);
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(first, i);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
  });
}

export function MonthSelect({ value, onChange, className }: { value: string; onChange: (month: string) => void; className?: string }) {
  const options = monthOptions();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full sm:w-52', className)} aria-label="Month">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ------------------------------------------------------------------ Date stepper
// Previous / next day arrows around a native date input, with a Today shortcut.
export function DateStepper({
  value,
  onChange,
  max,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  max?: string;
  className?: string;
}) {
  const step = (days: number) => onChange(format(addDays(parseDay(value), days), 'yyyy-MM-dd'));
  const isToday = value === todayISO();
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous day">
        <ChevronLeft />
      </Button>
      <Input
        type="date"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-auto min-w-[10.5rem]"
        aria-label={`Date, ${formatDay(value)}`}
        data-testid="input-date"
      />
      <Button variant="outline" size="icon" onClick={() => step(1)} disabled={!!max && value >= max} aria-label="Next day">
        <ChevronRight />
      </Button>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(todayISO())}>
          Today
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Worker picker
export interface PickerWorker {
  id: string;
  name: string | null;
  worker_type?: string | null;
  site?: { site_name: string } | null;
}

export function WorkerPicker({
  workers,
  value,
  onChange,
  placeholder = 'Select worker',
  id,
}: {
  workers: PickerWorker[];
  value: string | null;
  onChange: (workerId: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = workers.find((w) => w.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search workers" />
          <CommandList>
            <CommandEmpty>No worker found.</CommandEmpty>
            <CommandGroup>
              {workers.map((worker) => (
                <CommandItem
                  key={worker.id}
                  // includes the site so "Kumasi" also finds people there
                  value={`${worker.name ?? ''} ${worker.site?.site_name ?? ''} ${worker.id}`}
                  onSelect={() => {
                    onChange(worker.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === worker.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{worker.name || 'Unnamed worker'}</span>
                  {worker.site?.site_name && <span className="ml-auto pl-3 text-xs text-muted-foreground">{worker.site.site_name}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
