import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { AlertTriangle, BarChart3, Boxes, Percent, TrendingUp, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { formatDay, money, monthISO, todayISO, whole } from '@/lib/format';
import { attendanceBySite, attendanceTrend, topMovers } from '@/lib/insights';
import { useAttendanceRange, useStockMovements } from '@/lib/api/insights';
import { useWorkers } from '@/lib/api/workers';
import { useSites } from '@/lib/api/reference';
import { isLowStock, useInventory } from '@/lib/api/logistics';
import { usePayrollPeriods } from '@/lib/api/payroll';
import { errorMessage } from '@/lib/api/util';
import { exportTable } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ExportMenu } from '@/components/common/export-menu';
import { StatCard } from '@/components/common/stat-card';
import { Segmented } from '@/components/common/controls';

type Range = '14' | '30' | '90';

const C = {
  navy: 'hsl(var(--chart-1))',
  crimson: 'hsl(var(--chart-2))',
  amber: 'hsl(var(--chart-3))',
  blue: 'hsl(var(--chart-4))',
  slate: 'hsl(var(--chart-5))',
};
const AXIS = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } as const;
const TOOLTIP = { contentStyle: { borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 } } as const;

function ChartCard({ title, description, children, loading, error, empty, onRetry }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 h-64">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load this chart" description={errorMessage(error)} action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>} />
        ) : empty ? (
          <EmptyState icon={BarChart3} title="Nothing to show yet" description="This fills in as records are added." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export default function InsightsPage() {
  const { userRole } = useAuth();
  const showPeople = can(userRole, 'viewPeopleInsights');
  const showCost = can(userRole, 'viewCostInsights');
  const showStock = can(userRole, 'viewStockInsights');

  const [range, setRange] = useState<Range>('30');
  const today = todayISO();
  const fromLocal = useMemo(() => format(subDays(new Date(), Number(range) - 1), 'yyyy-MM-dd'), [range]);

  const attendance = useAttendanceRange(fromLocal, today);
  const workers = useWorkers({ enabled: showPeople });
  const sites = useSites();
  const periods = usePayrollPeriods();
  const inventory = useInventory(null, showStock);
  const movements = useStockMovements(fromLocal, showStock);

  const rows = attendance.data ?? [];
  const trend = useMemo(() => attendanceTrend(rows, fromLocal, today), [rows, fromLocal, today]);
  const siteOfWorker = useMemo(() => new Map((workers.data ?? []).map((w) => [w.id, w.site_id])), [workers.data]);
  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.site_name])), [sites.data]);
  const bySite = useMemo(() => attendanceBySite(rows, siteOfWorker, siteName), [rows, siteOfWorker, siteName]);
  const movers = useMemo(() => topMovers(movements.data ?? []), [movements.data]);
  const monthly = useMemo(() => [...(periods.data ?? [])].slice(0, 12).reverse().map((p) => ({ month: p.month, gross: Number(p.gross), deductions: Number(p.total_deductions), net: Number(p.net) })), [periods.data]);
  const low = useMemo(() => (inventory.data ?? []).filter(isLowStock).sort((a, b) => a.quantity - b.quantity), [inventory.data]);

  const marked = rows.length;
  const presentCredit = rows.reduce((n, r) => n + (r.status === 'Present' ? 1 : r.status === 'Half Day' ? 0.5 : 0), 0);
  const overallRate = marked ? Math.round((presentCredit / marked) * 1000) / 10 : null;
  const thisMonth = periods.data?.find((p) => p.month === monthISO());
  const lastClosed = periods.data?.[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="How attendance, labour cost and stock are trending."
        actions={
          <>
            {showPeople && (
              <ExportMenu
                label="Export attendance"
                disabled={trend.length === 0}
                onExport={(format) =>
                  exportTable(format, {
                    baseName: `attendance-trend-${fromLocal}-to-${today}`,
                    title: 'Attendance trend',
                    subtitle: `${formatDay(fromLocal)} to ${formatDay(today)}`,
                    head: ['Date', 'Marked', 'Present', 'Absent', 'Leave', 'Attendance rate %'],
                    body: trend.map((d) => [d.date, d.marked, d.present, d.absent, d.leave, d.rate]),
                  })
                }
              />
            )}
            <Segmented
              label="Period"
              value={range}
              onChange={setRange}
              options={[{ value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showPeople && <StatCard label="Attendance rate" value={overallRate == null ? '-' : `${overallRate}%`} hint={`Last ${range} days, half days count as half`} icon={Percent} loading={attendance.isLoading} />}
        {showPeople && <StatCard label="Marks recorded" value={whole(marked)} hint={`Last ${range} days`} icon={Users} tone="info" loading={attendance.isLoading} />}
        {showCost && <StatCard label="Last closed payroll" value={lastClosed ? money(Number(lastClosed.net)) : '-'} hint={lastClosed ? `Net pay, ${lastClosed.month}` : 'No month closed yet'} icon={TrendingUp} loading={periods.isLoading} />}
        {showStock && <StatCard label="Items to reorder" value={whole(low.length)} hint="At or below their reorder level" icon={Boxes} tone={low.length ? 'warning' : 'neutral'} loading={inventory.isLoading} />}
      </div>
      {showCost && thisMonth && <p className="text-sm text-muted-foreground">This month is already closed: net pay {money(Number(thisMonth.net))}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {showPeople && (
          <ChartCard title="Attendance rate by day" description="Share of marked workers who came in" loading={attendance.isLoading} error={attendance.error} empty={marked === 0} onRetry={() => attendance.refetch()}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis tick={AXIS} domain={[0, 100]} unit="%" />
              <Tooltip {...TOOLTIP} labelFormatter={(d: string) => formatDay(d)} formatter={(v) => (v == null || v === '' ? 'No marks' : `${v}%`)} />
              <Area type="monotone" dataKey="rate" name="Attendance rate" stroke={C.navy} fill={C.navy} fillOpacity={0.12} connectNulls />
            </AreaChart>
          </ChartCard>
        )}

        {showPeople && (
          <ChartCard title="Attendance by site" description={`Marks in the last ${range} days`} loading={attendance.isLoading || workers.isLoading} error={attendance.error ?? workers.error} empty={bySite.length === 0}>
            <BarChart data={bySite} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="site" tick={AXIS} interval={0} tickFormatter={(s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s)} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Legend />
              <Bar dataKey="present" name="Present" stackId="a" fill={C.navy} />
              <Bar dataKey="leave" name="Leave" stackId="a" fill={C.blue} />
              <Bar dataKey="absent" name="Absent" stackId="a" fill={C.crimson} />
            </BarChart>
          </ChartCard>
        )}

        {showCost && (
          <ChartCard title="Labour cost by month" description="From closed payroll months" loading={periods.isLoading} error={periods.error} empty={monthly.length === 0} onRetry={() => periods.refetch()}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={AXIS} />
              <YAxis tick={AXIS} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip {...TOOLTIP} formatter={(v) => money(Number(v))} />
              <Legend />
              <Bar dataKey="gross" name="Gross" fill={C.slate} />
              <Bar dataKey="net" name="Net pay" fill={C.navy} />
            </BarChart>
          </ChartCard>
        )}

        {showStock && (
          <ChartCard title="Most moved stock" description={`Quantity sent out in the last ${range} days`} loading={movements.isLoading} error={movements.error} empty={movers.length === 0} onRetry={() => movements.refetch()}>
            <BarChart data={movers} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={96} tickFormatter={(s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s)} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="quantity" name="Quantity sent" fill={C.crimson} />
            </BarChart>
          </ChartCard>
        )}
      </div>

      {showStock && (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 sm:px-5">
            <h2 className="font-semibold">Reorder list</h2>
            <p className="text-sm text-muted-foreground">Items at or below the level set for them. Set levels in Logistics.</p>
          </div>
          {inventory.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : low.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing needs reordering.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="reorder-list">
              {low.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.item_name}</span>
                    <span className="block text-sm text-muted-foreground">{i.stores?.name ?? 'Store'}</span>
                  </span>
                  <span className="num shrink-0 text-right text-sm">
                    <span className={i.quantity <= 0 ? 'font-semibold text-danger' : 'font-semibold'}>{whole(i.quantity)}</span>
                    <span className="text-muted-foreground"> left, reorder at {whole(i.min_quantity)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
