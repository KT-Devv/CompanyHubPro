import { useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof Table2 }[] = [
  { format: 'xlsx', label: 'Excel', hint: '.xlsx workbook', icon: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', hint: 'Branded, ready to print', icon: FileText },
  { format: 'csv', label: 'CSV', hint: 'Plain data for other systems', icon: Table2 },
];

interface ExportMenuProps {
  /** Runs the export in the chosen format. It builds and downloads the file. */
  onExport: (format: ExportFormat) => Promise<void> | void;
  disabled?: boolean;
  label?: string;
  formats?: ExportFormat[];
  variant?: 'outline' | 'default' | 'ghost';
}

// One consistent Export button for every table in the app.
export function ExportMenu({ onExport, disabled, label = 'Export', formats = ['xlsx', 'pdf', 'csv'], variant = 'outline' }: ExportMenuProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run(format: ExportFormat) {
    setBusy(true);
    try {
      await onExport(format);
    } catch (err) {
      toast({ title: 'Could not export', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} disabled={disabled || busy} data-testid="button-export">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {label}
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Download as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.filter((f) => formats.includes(f.format)).map(({ format, label: name, hint, icon: Icon }) => (
          <DropdownMenuItem key={format} onClick={() => run(format)} data-testid={`export-${format}`}>
            <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span>{name}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
