import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

// The icon sits on a tint of white; only the icon takes the status colour.
// The whole tile gets a faint wash of its tone too, fading to plain white.
const washClasses: Record<Tone, string> = {
  neutral: 'from-card to-card',
  success: 'from-success-soft/70 to-card',
  warning: 'from-warning-soft/70 to-card',
  danger: 'from-danger-soft/70 to-card',
  info: 'from-info-soft/70 to-card',
};

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', loading, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-card-border bg-gradient-to-br p-4 shadow-card sm:p-5', washClasses[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="num mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
