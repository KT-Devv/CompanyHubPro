import { format, isValid, parseISO } from 'date-fns';

export const CURRENCY = '₵';

// A date-only string ('2026-09-20') parsed as a local day. new Date('2026-09-20')
// is UTC midnight, which is still the previous day west of Greenwich.
export function parseDay(iso: string): Date {
  return parseISO(iso);
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function monthISO(date: Date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function formatDay(iso: string | null | undefined, pattern = 'EEE, d MMM yyyy'): string {
  if (!iso) return '-';
  const d = parseISO(iso);
  return isValid(d) ? format(d, pattern) : '-';
}

export function formatDateTime(iso: string | null | undefined, pattern = 'd MMM yyyy, HH:mm'): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isValid(d) ? format(d, pattern) : '-';
}

export function formatTime(iso: string | null | undefined): string {
  return formatDateTime(iso, 'HH:mm');
}

export function money(value: number | null | undefined): string {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  return `${CURRENCY}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function whole(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US');
}

export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string | null | undefined, fallback = 'U'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '';
  return (first + last).toUpperCase();
}

export const WORKER_TYPE_LABEL: Record<string, string> = {
  casual: 'Casual',
  non_marking: 'Non-marking',
};

export function workerTypeLabel(type: string | null | undefined): string {
  return (type && WORKER_TYPE_LABEL[type]) || '-';
}
