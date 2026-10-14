import { useEffect, useState, type ReactNode } from 'react';
import { HardHat, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { MFA_ROLES, isUserRole } from '@/lib/roles';
import { useRequireMfa } from '@/lib/api/settings';
import { ChallengePanel, EnrollPanel } from './mfa-panels';

// When the CEO has made two-step sign-in compulsory, the roles that handle
// money and people must complete it before seeing anything. The database
// enforces the same rule on every request, so this screen is a courtesy: without
// it those roles would just see empty lists.
export function MfaGate({ children }: { children: ReactNode }) {
  const { userRole, aal, hasFactor, offlineSession, signOut, refreshAssurance } = useAuth();
  const required = useRequireMfa();
  const [, force] = useState(0);

  // Make sure we know the level, in case it changed in another tab.
  useEffect(() => { void refreshAssurance(); }, [refreshAssurance]);

  const applies = required && isUserRole(userRole) && MFA_ROLES.includes(userRole) && !offlineSession;
  if (!applies || aal === 'aal2' || aal === null) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{hasFactor ? 'Two-step sign-in' : 'Set up two-step sign-in'}</h1>
            <p className="text-sm text-muted-foreground">
              {hasFactor ? 'Enter your code to continue.' : 'Your role must use an authenticator app. It takes a minute.'}
            </p>
          </div>
        </div>
        {hasFactor ? <ChallengePanel onDone={() => force((n) => n + 1)} /> : <EnrollPanel onDone={() => force((n) => n + 1)} />}
        <Button variant="ghost" className="w-full" onClick={() => signOut().catch(console.error)}>
          <LogOut /> Sign out
        </Button>
      </Card>
    </div>
  );
}
