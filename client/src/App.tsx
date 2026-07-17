import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import AttendancePage from "@/pages/attendance";
import AttendanceManagementPage from "@/pages/attendance-management";
import LogisticsPage from "@/pages/logistics";
import StoreLogisticsPage from "@/pages/store-logistics";
import WorkersManagementPage from "@/pages/workers-management";
import SalariesManagementPage from "@/pages/salaries-management";
import FinancePage from "@/pages/finance";
import SystemManagementPage from "@/pages/system-management";
import WelcomeManagement from "@/pages/welcome-management";
import WelcomeSecretary from "@/pages/welcome-secretary";
import WelcomeSupervisor from "@/pages/welcome-supervisor";
import WorkerTransferPage from "@/pages/worker-transfer";
import { Loader2, Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";

function ProtectedRoute({ component: Component, allowedRoles, ...rest }: any) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!userRole) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
}

function LoginWrapper() {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If already logged in, redirect based on role
  if (user) {
    if (['ceo', 'hr', 'project_manager', 'system_manager', 'finance'].includes(userRole || '')) {
      return <Redirect to="/welcome-management" />;
    } else if (userRole === 'secretary') {
      return <Redirect to="/welcome-secretary" />;
    } else if (userRole === 'supervisor') {
      return <Redirect to="/welcome-supervisor" />;
    } else if (userRole === 'store_manager' || userRole === 'logistics_manager') {
      return <Redirect to="/store-logistics" />;
    }
  }

  return <Login />;
}

function Router() {
  const { user, userRole } = useAuth();

  // Redirect based on role
  function RoleBasedRedirect() {
    if (['ceo', 'hr', 'project_manager', 'system_manager', 'finance'].includes(userRole || '')) {
      return <Redirect to="/welcome-management" />;
    } else if (userRole === 'secretary') {
      return <Redirect to="/welcome-secretary" />;
    } else if (userRole === 'supervisor') {
      return <Redirect to="/welcome-supervisor" />;
    } else if (userRole === 'store_manager' || userRole === 'logistics_manager') {
      return <Redirect to="/store-logistics" />;
    }
    return <Redirect to="/attendance" />;
  }

  return (
    <Switch>
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/login" component={LoginWrapper} />
      <Route path="/">
        {user ? <RoleBasedRedirect /> : <Redirect to="/login" />}
      </Route>
      <Route path="/welcome-management">
        <ProtectedRoute
          component={WelcomeManagement}
          allowedRoles={['ceo', 'hr', 'project_manager', 'system_manager', 'finance']}
        />
      </Route>
      <Route path="/welcome-secretary">
        <ProtectedRoute
          component={WelcomeSecretary}
          allowedRoles={['secretary']}
        />
      </Route>
      <Route path="/welcome-supervisor">
        <ProtectedRoute
          component={WelcomeSupervisor}
          allowedRoles={['supervisor']}
        />
      </Route>
      <Route path="/attendance">
        <ProtectedRoute
          component={AttendancePage}
          // Supervisors, secretaries, and store_managers mark attendance
          allowedRoles={['supervisor', 'secretary', 'store_manager']}
        />
      </Route>
      <Route path="/attendance-management">
        <ProtectedRoute
          component={AttendanceManagementPage}
          allowedRoles={['ceo', 'hr', 'project_manager', 'system_manager']}
        />
      </Route>
      <Route path="/workers-management">
        <ProtectedRoute
          component={WorkersManagementPage}
          allowedRoles={['ceo', 'hr', 'system_manager', 'project_manager']}
        />
      </Route>
      <Route path="/logistics">
        <ProtectedRoute
          component={LogisticsPage}
          allowedRoles={['ceo', 'hr', 'system_manager', 'logistics_manager', 'project_manager']}
        />
      </Route>
      <Route path="/store-logistics">
        <ProtectedRoute
          component={StoreLogisticsPage}
          allowedRoles={['store_manager', 'logistics_manager']}
        />
      </Route>
      <Route path="/salaries-management">
        <ProtectedRoute
          component={SalariesManagementPage}
          // Salaries logic left intact for older roles, wait, Finance Officer gets /finance, but maybe we rename /salaries-management to /finance or just use the same page?
          // I'll leave the old one as it was, and create /finance for Finance portal, or repurpose this. 
          // actually, the user said "create a new portal for the finance officer". So we'll limit old one or redirect.
          allowedRoles={['ceo', 'hr']}
        />
      </Route>
      <Route path="/finance">
        <ProtectedRoute
          component={FinancePage}
          allowedRoles={['ceo', 'hr', 'system_manager', 'finance']}
        />
      </Route>
      <Route path="/system-management">
        <ProtectedRoute
          component={SystemManagementPage}
          allowedRoles={['ceo', 'hr', 'system_manager']}
        />
      </Route>
      <Route path="/worker-transfer">
        <ProtectedRoute
          component={WorkerTransferPage}
          allowedRoles={['ceo', 'hr', 'system_manager', 'project_manager']}
        />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!user) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-16 px-3 sm:px-4 border-b border-border bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="font-mono hidden sm:inline">{format(currentTime, 'EEE, MMM dd, yyyy HH:mm:ss')}</span>
              <span className="font-mono sm:hidden">{format(currentTime, 'MMM dd, HH:mm')}</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <DashboardLayout>
            <Router />
          </DashboardLayout>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
