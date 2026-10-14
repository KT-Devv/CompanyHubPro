import { addDays, format, parseISO } from 'date-fns';
import type { AttendanceStatus } from './types';

export interface DayPoint {
  date: string;
  present: number;
  absent: number;
  leave: number;
  marked: number;
  /** Share of marked workers who came in (a half day counts as half), 0-100; null on days nobody was marked. */
  rate: number | null;
}

interface Dot {
  worker_id: string;
  date: string;
  status: AttendanceStatus;
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) days.push(format(d, 'yyyy-MM-dd'));
  return days;
}

// One point per day between from and to (inclusive), including days with no marks.
export function attendanceTrend(rows: Dot[], from: string, to: string): DayPoint[] {
  const byDay = new Map<string, DayPoint>(
    eachDay(from, to).map((date) => [date, { date, present: 0, absent: 0, leave: 0, marked: 0, rate: null }]),
  );
  const credit = new Map<string, number>();
  for (const r of rows) {
    const p = byDay.get(r.date);
    if (!p) continue;
    p.marked++;
    if (r.status === 'Present') { p.present++; credit.set(r.date, (credit.get(r.date) ?? 0) + 1); }
    else if (r.status === 'Half Day') { p.present++; credit.set(r.date, (credit.get(r.date) ?? 0) + 0.5); }
    else if (r.status === 'Absent') p.absent++;
    else p.leave++;
  }
  byDay.forEach((p) => {
    p.rate = p.marked ? Math.round(((credit.get(p.date) ?? 0) / p.marked) * 1000) / 10 : null;
  });
  return Array.from(byDay.values());
}

export interface SiteBar {
  site: string;
  present: number;
  absent: number;
  leave: number;
}

// Attendance totals per site. Workers with no site are grouped as "No site".
export function attendanceBySite(rows: Dot[], siteOfWorker: Map<string, string | null>, siteName: Map<string, string>): SiteBar[] {
  const bars = new Map<string, SiteBar>();
  for (const r of rows) {
    const siteId = siteOfWorker.get(r.worker_id) ?? null;
    const name = (siteId && siteName.get(siteId)) || 'No site';
    const bar = bars.get(name) ?? { site: name, present: 0, absent: 0, leave: 0 };
    if (r.status === 'Present' || r.status === 'Half Day') bar.present++;
    else if (r.status === 'Absent') bar.absent++;
    else bar.leave++;
    bars.set(name, bar);
  }
  return Array.from(bars.values()).sort((a, b) => b.present - a.present);
}

export interface TopItem {
  name: string;
  quantity: number;
}

// The items sent out most, by total quantity.
export function topMovers(rows: { quantity: number; inventory: { item_name: string } | null }[], limit = 8): TopItem[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const name = r.inventory?.item_name ?? 'Unknown item';
    totals.set(name, (totals.get(name) ?? 0) + Number(r.quantity));
  }
  return Array.from(totals, ([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}
