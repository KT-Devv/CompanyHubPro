import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { persister, PERSIST_BUSTER, PERSIST_MAX_AGE, shouldPersistQuery } from "./lib/offline/persist";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { canAccess, homePathForRole, LEGACY_REDIRECTS, type AppRoute } from "@/lib/roles";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { MfaGate } from "@/components/common/mfa-gate";
import NotFound from "@/pages/not-found";

// Each page is its own chunk, so a supervisor marking attendance on mobile data
// doesn't download the finance, logistics and admin screens up front.
const Login = lazy(() => import("@/pages/login"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const InsightsPage = lazy(() => import("@/pages/insights"));
const WorkersPage = lazy(() => import("@/pages/workers"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const AttendanceRecordsPage = lazy(() => import("@/pages/attendance-records"));
const FinancePage = lazy(() => import("@/pages/finance"));
const LogisticsPage = lazy(() => import("@/pages/logistics"));
const TransfersPage = lazy(() => import("@/pages/transfers"));
const AuditPage = lazy(() => import("@/pages/audit"));
const AccountsPage = lazy(() => import("@/pages/accounts"));
const SecurityPage = lazy(() => import("@/pages/security"));

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Roles come from ROUTE_ROLES so the router, sidebar and dashboard agree.
function ProtectedRoute({ path, component: Page }: { path: AppRoute; component: ComponentType }) {
  const { user, userRole, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!user || !userRole) return <Redirect to="/login" />;
  if (!canAccess(userRole, path)) return <Redirect to={homePathForRole(userRole) ?? "/login"} />;
  return <Page />;
}

function LoginWrapper() {
  const { user, userRole, loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  const home = user ? homePathForRole(userRole) : null;
  if (home) return <Redirect to={home} />;
  return <Login />;
}

const PAGES: [AppRoute, ComponentType][] = [
  ["/", Dashboard],
  ["/insights", InsightsPage],
  ["/workers", WorkersPage],
  ["/attendance", AttendancePage],
  ["/attendance/records", AttendanceRecordsPage],
  ["/finance", FinancePage],
  ["/logistics", LogisticsPage],
  ["/transfers", TransfersPage],
  ["/audit", AuditPage],
  ["/accounts", AccountsPage],
  ["/security", SecurityPage],
];

function Router() {
  return (
    <Switch>
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/login" component={LoginWrapper} />
      {PAGES.map(([path, Page]) => (
        <Route key={path} path={path}>
          <ProtectedRoute path={path} component={Page} />
        </Route>
      ))}
      {/* Links and bookmarks from the previous version of the app */}
      {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
        <Route key={from} path={from}>
          <Redirect to={to} />
        </Route>
      ))}
      <Route component={NotFound} />
    </Switch>
  );
}

// The sidebar and top bar only wrap signed-in pages. The login and reset pages
// render bare (a password-recovery link signs the user in, and used to draw the
// dashboard chrome around the form).
function Layout({ children }: { children: ReactNode }) {
  const { user, userRole } = useAuth();
  const [location] = useLocation();
  const bare = location === "/login" || location === "/reset-password";

  if (!user || !userRole || bare) return <>{children}</>;
  return (
    <MfaGate>
      <AppShell>{children}</AppShell>
    </MfaGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
          buster: PERSIST_BUSTER,
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <TooltipProvider>
          <AuthProvider>
            <Layout>
              <Suspense fallback={<FullPageSpinner />}>
                <Router />
              </Suspense>
            </Layout>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
