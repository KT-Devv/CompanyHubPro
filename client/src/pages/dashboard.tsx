import { useMemo } from 'react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { ArrowRight, Boxes, ClipboardCheck, Clock3, Coffee, PackageCheck, TrendingDown, Users, Wallet, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canAccess, roleLabel } from '@/lib/roles';
import { greeting, money, monthISO, todayISO, whole } from '@/lib/format';
import { useSites } from '@/lib/api/reference';
import { useWorkers } from '@/lib/api/workers';
import { useAttendanceOn } from '@/lib/api/attendance';
import { useLedger } from '@/lib/api/finance';
import { LOW_STOCK_THRESHOLD, useIncomingLogs, useInventory } from '@/lib/api/logistics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { visibleNav } from '@/components/layout/app-sidebar';

// ------------------------------------------------------------------ Attendance
function AttendanceSnapshot() {
  const { userRole, userSiteId } = useAuth();
  const isSupervisor = userRole === 'supervisor';
  const isSecretary = userRole === 'secretary';
  const overview = canAccess(userRole, '/attendance/records');
  const today = todayISO();

  const workers = useWorkers({
    siteId: isSupervisor ? userSiteId : null,
    type: isSecretary ? 'non_marking' : undefined,
    // A supervisor without a site has nobody to show.
    enabled: !isSupervisor || !!userSiteId,
  });
  const attendance = useAttendanceOn(today);
  const sites = useSites();

  const stats = useMemo(() => {
    const scoped = workers.data ?? [];
    const ids = new Set(scoped.map((w) => w.id));
    const records = (attendance.data ?? []).filter((r) => ids.has(r.worker_id));
    const count = (status: string) => records.filter((r) => r.status === status).length;
    const present = count('Present') + count('Half Day');

    const bySite = (sites.data ?? [])
      .map((site) => {
        const siteWorkers = scoped.filter((w) => w.site_id === site.id);
        const siteIds = new Set(siteWorkers.map((w) => w.id));
        const marked = records.filter((r) => siteIds.has(r.worker_id));
        return {
          id: site.id,
          name: site.site_name,
          total: siteWorkers.length,
          marked: marked.length,
          present: marked.filter((r) => r.status === 'Present' || r.status === 'Half Day').length,
        };
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    return { total: scoped.length, marked: records.length, present, absent: count('Absent'), leave: count('Leave'), half: count('Half Day'), bySite };
  }, [workers.data, attendance.data, sites.data]);

  const loading = workers.isLoading || attendance.isLoading;
  const pct = stats.total ? Math.round((stats.marked / stats.total) * 100) : 0;

  if (isSupervisor && !userSiteId) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="You're not assigned to a site yet"
          description="Ask an administrator to assign a site to your profile so your workers appear here."
        />
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="attendance-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="attendance-heading" className="text-lg font-semibold">
            Attendance today
          </h2>
          <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, d MMMM')}</p>
        </div>
        {canAccess(userRole, '/attendance') && (
          <Button asChild>
            <Link href="/attendance">
              <ClipboardCheck /> Mark attendance
            </Link>
          </Button>
        )}
        {overview && (
          <Button asChild variant="outline">
            <Link href="/attendance/records">
              View records <ArrowRight />
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={isSecretary ? 'Office staff' : isSupervisor ? 'Workers on your site' : 'Workers'} value={whole(stats.total)} icon={Users} loading={loading} />
        <StatCard label="Present" value={whole(stats.present)} hint={stats.half ? `${stats.half} half day` : undefined} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="Absent" value={whole(stats.absent)} icon={XCircle} tone="danger" loading={loading} />
        <StatCard label="On leave" value={whole(stats.leave)} icon={Coffee} tone="info" loading={loading} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Marked so far</CardTitle>
            <span className="num text-sm text-muted-foreground">
              {stats.marked} of {stats.total} <span className="text-foreground">({pct}%)</span>
            </span>
          </div>
          <Progress value={pct} className="mt-3 h-2 bg-pearl" aria-label="Share of workers marked today" />
        </CardHeader>

        {overview && stats.bySite.length > 0 && (
          <CardContent>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">By site</p>
            <ul className="divide-y divide-border">
              {stats.bySite.map((site) => (
                <li key={site.id} className="flex items-center gap-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{site.name}</span>
                  <Progress value={site.total ? (site.marked / site.total) * 100 : 0} className="hidden h-1.5 w-32 bg-pearl sm:block" />
                  <span className="num w-44 whitespace-nowrap text-right text-sm text-muted-foreground">
                    <span className="text-foreground">{site.present}</span> present · {site.marked}/{site.total} marked
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ Stock
function StockSnapshot() {
  const { userRole, userStoreId } = useAuth();
  const storeScoped = userRole === 'store_manager';
  const storeId = storeScoped ? userStoreId : null;
  const enabled = !storeScoped || !!userStoreId;

  const inventory = useInventory(storeId, enabled);
  const incoming = useIncomingLogs(storeId, enabled);

  const items = inventory.data ?? [];
  const low = items.filter((i) => i.quantity < LOW_STOCK_THRESHOLD);
  const units = items.reduce((sum, i) => sum + i.quantity, 0);
  const loading = inventory.isLoading || incoming.isLoading;

  if (storeScoped && !userStoreId) {
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="You're not assigned to a store yet" description="Ask an administrator to assign a store to your profile." />
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="stock-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="stock-heading" className="text-lg font-semibold">
            {storeScoped ? 'Your store' : 'Stock'}
          </h2>
          <p className="text-sm text-muted-foreground">{storeScoped ? 'Inventory and shipments for your store' : 'Across all stores'}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/logistics">
            Open logistics <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items tracked" value={whole(items.length)} icon={Boxes} loading={loading} />
        <StatCard label="Units in stock" value={whole(units)} icon={PackageCheck} loading={loading} />
        <StatCard label="Running low" value={whole(low.length)} hint={`Under ${LOW_STOCK_THRESHOLD} units`} icon={TrendingDown} tone={low.length ? 'warning' : 'neutral'} loading={loading} />
        <StatCard label="Shipments in transit" value={whole(incoming.data?.length ?? 0)} icon={Clock3} tone={incoming.data?.length ? 'info' : 'neutral'} loading={loading} />
      </div>
      {low.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Low stock</CardTitle>
            <CardDescription>The {Math.min(low.length, 6)} lowest items</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {[...low]
                .sort((a, b) => a.quantity - b.quantity)
                .slice(0, 6)
                .map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate">
                      {item.item_name}
                      {!storeScoped && item.stores?.name && <span className="text-muted-foreground"> · {item.stores.name}</span>}
                    </span>
                    <span className="num font-medium text-warning">{item.quantity}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Finance
function FinanceSnapshot() {
  const month = monthISO();
  const advances = useLedger('salary_advances', month);
  const loans = useLedger('loans', month);
  const deductions = useLedger('deductions', month);
  const sum = (rows?: { amount: number }[]) => (rows ?? []).reduce((total, r) => total + r.amount, 0);
  const loading = advances.isLoading || loans.isLoading || deductions.isLoading;

  return (
    <section className="space-y-4" aria-labelledby="finance-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="finance-heading" className="text-lg font-semibold">
            Payroll this month
          </h2>
          <p className="text-sm text-muted-foreground">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/finance">
            Open finance <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Advances" value={money(sum(advances.data))} hint={`${advances.data?.length ?? 0} entries`} icon={Wallet} loading={loading} />
        <StatCard label="Loans" value={money(sum(loans.data))} hint={`${loans.data?.length ?? 0} entries`} icon={Wallet} loading={loading} />
        <StatCard label="Other deductions" value={money(sum(deductions.data))} hint={`${deductions.data?.length ?? 0} entries`} icon={Wallet} className="col-span-2 lg:col-span-1" loading={loading} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Page
export default function Dashboard() {
  const { userRole, userFullName } = useAuth();
  const firstName = userFullName?.trim().split(/\s+/)[0];

  const showAttendance = canAccess(userRole, '/attendance/records') || userRole === 'supervisor' || userRole === 'secretary';
  const showStock = canAccess(userRole, '/logistics');
  const showFinance = canAccess(userRole, '/finance');

  // Everything else the role can open, as quick links (the dashboard itself excluded).
  const shortcuts = visibleNav(userRole)
    .flatMap((g) => g.items)
    .filter((i) => i.url !== '/');

  return (
    <div className="space-y-10">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={`${roleLabel(userRole)}. Here's what's happening today.`}
      />

      {showAttendance && <AttendanceSnapshot />}
      {showStock && <StockSnapshot />}
      {showFinance && <FinanceSnapshot />}

      {shortcuts.length > 0 && (
        <section className="space-y-4" aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading" className="text-lg font-semibold">
            Jump to
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((item) => (
              <Link
                key={item.url}
                href={item.url}
                className="group flex items-center gap-3 rounded-xl border border-card-border bg-card p-4 shadow-xs outline-none transition-colors hover:bg-alabaster focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ivory text-foreground/70">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-sm font-medium">{item.title}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
