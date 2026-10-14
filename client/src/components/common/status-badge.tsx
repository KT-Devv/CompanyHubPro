import { AlertTriangle, CheckCircle2, Clock3, Coffee, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GoodsLogStatus } from '@/lib/types';
import { workerTypeLabel } from '@/lib/format';

const attendanceMeta = {
  Present: { variant: 'success', icon: CheckCircle2 },
  Absent: { variant: 'danger', icon: XCircle },
  Leave: { variant: 'info', icon: Coffee },
  'Half Day': { variant: 'warning', icon: Clock3 },
} as const;

export function AttendanceBadge({ status }: { status: string }) {
  const meta = attendanceMeta[status as keyof typeof attendanceMeta];
  if (!meta) return <Badge variant="outline">{status}</Badge>;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon className="h-3 w-3" aria-hidden />
      {status}
    </Badge>
  );
}

export function WorkerTypeBadge({ type }: { type: string | null | undefined }) {
  return <Badge variant="outline">{workerTypeLabel(type)}</Badge>;
}

export function StockBadge({ quantity, minQuantity }: { quantity: number; minQuantity: number }) {
  if (quantity <= 0) return <Badge variant="danger">Out of stock</Badge>;
  if (minQuantity > 0 && quantity <= minQuantity) return <Badge variant="warning">Reorder</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

const logMeta: Record<GoodsLogStatus, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'In transit' },
  matched: { variant: 'success', label: 'Matched' },
  error: { variant: 'danger', label: 'Mismatch' },
};

export function LogStatusBadge({ status }: { status: GoodsLogStatus }) {
  const meta = logMeta[status] ?? { variant: 'warning' as const, label: status };
  return (
    <Badge variant={meta.variant}>
      {status === 'error' && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {meta.label}
    </Badge>
  );
}
