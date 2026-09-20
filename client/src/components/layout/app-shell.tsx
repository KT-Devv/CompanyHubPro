import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/roles';
import { AppSidebar } from './app-sidebar';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Minute precision is plenty and avoids a re-render every second.
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <CalendarDays className="h-4 w-4" aria-hidden />
      <span className="num hidden sm:inline">{format(now, 'EEE, d MMM yyyy')}</span>
      <span className="num sm:hidden">{format(now, 'd MMM')}</span>
      <span className="num font-medium text-foreground">{format(now, 'HH:mm')}</span>
    </div>
  );
}

// Sidebar + top bar + a centred content column. Only rendered for signed-in
// users; the login and reset pages render bare.
export function AppShell({ children }: { children: ReactNode }) {
  const { userRole } = useAuth();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-1.5" />
            <Badge variant="outline" className="hidden sm:inline-flex">
              {roleLabel(userRole)}
            </Badge>
          </div>
          <Clock />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
