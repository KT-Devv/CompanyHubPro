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
import AttendancePage from "@/pages/attendance";
import AttendanceManagementPage from "@/pages/attendance-management";
import LogisticsPage from "@/pages/logistics";
import WorkersManagementPage from "@/pages/workers-management";
import WelcomeManagement from "@/pages/welcome-management";
import WelcomeSecretary from "@/pages/welcome-secretary";
import WelcomeSupervisor from "@/pages/welcome-supervisor";
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

  // Check role-based access
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Redirect to="/attendance" />;
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
    if (userRole === 'owner' || userRole === 'hr' || userRole === 'project_manager') {
      return <Redirect to="/welcome-management" />;
    } else if (userRole === 'secretary') {
      return <Redirect to="/welcome-secretary" />;
    } else if (userRole === 'supervisor') {
      return <Redirect to="/welcome-supervisor" />;
    }
  }

  return <Login />;
}

function Router() {
  const { user, userRole } = useAuth();

  // Redirect based on role
  function RoleBasedRedirect() {
    if (userRole === 'owner' || userRole === 'hr' || userRole === 'project_manager') {
      return <Redirect to="/welcome-management" />;
    } else if (userRole === 'secretary') {
      return <Redirect to="/welcome-secretary" />;
    } else if (userRole === 'supervisor') {
      return <Redirect to="/welcome-supervisor" />;
    }
    return <Redirect to="/attendance" />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginWrapper} />
      <Route path="/">
        {user ? <RoleBasedRedirect /> : <Redirect to="/login" />}
      </Route>
      <Route path="/welcome-management">
        <ProtectedRoute 
          component={WelcomeManagement} 
          allowedRoles={['owner', 'hr', 'project_manager']} 
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
          allowedRoles={['supervisor', 'secretary']} 
        />
      </Route>
      <Route path="/attendance-management">
        <ProtectedRoute 
          component={AttendanceManagementPage} 
          allowedRoles={['owner', 'hr', 'project_manager']} 
        />
      </Route>
      <Route path="/workers-management">
        <ProtectedRoute 
          component={WorkersManagementPage} 
          allowedRoles={['owner', 'hr', ]} 
        />
      </Route>
      <Route path="/logistics">
        <ProtectedRoute 
          component={LogisticsPage} 
          allowedRoles={['owner', 'hr' ]} 
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
          <header className="flex items-center justify-between h-16 px-4 border-b border-border bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="font-mono">{format(currentTime, 'EEE, MMM dd, yyyy HH:mm:ss')}</span>
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
