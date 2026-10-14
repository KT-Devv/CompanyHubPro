import { useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { can, isUserRole, MFA_ROLES, roleLabel } from '@/lib/roles';
import { errorMessage } from '@/lib/api/util';
import { listTotpFactors, mfaErrorMessage, removeFactor } from '@/lib/api/mfa';
import { useRequireMfa, useSetSetting } from '@/lib/api/settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/common/page-header';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ChallengePanel, EnrollPanel } from '@/components/common/mfa-panels';

export default function SecurityPage() {
  const { userRole, aal, hasFactor, refreshAssurance } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requireMfa = useRequireMfa();
  const setSetting = useSetSetting();
  const [enrolling, setEnrolling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const mustUse = requireMfa && isUserRole(userRole) && MFA_ROLES.includes(userRole);

  const factors = useQuery({ queryKey: ['mfa', 'factors', hasFactor, aal], queryFn: listTotpFactors });
  const verified = (factors.data ?? []).find((f) => f.status === 'verified');

  async function remove() {
    if (!verified) return;
    setRemoving(true);
    try {
      await removeFactor(verified.id);
      await refreshAssurance();
      queryClient.invalidateQueries({ queryKey: ['mfa'] });
      toast({ title: 'Two-step sign-in turned off' });
    } catch (err) {
      toast({ title: 'Could not turn it off', description: mfaErrorMessage(err), variant: 'destructive' });
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  async function toggleRequired(on: boolean) {
    try {
      await setSetting.mutateAsync({ key: 'require_mfa', value: on ? 'true' : 'false' });
      toast({ title: on ? 'Two-step sign-in is now required' : 'Two-step sign-in is now optional' });
    } catch (err) {
      toast({ title: 'Could not change the setting', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Security" description="Protect your account with a second step when you sign in." />

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${verified ? 'bg-brand-soft text-brand' : 'bg-pearl text-muted-foreground'}`}>
            {verified ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <ShieldOff className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Authenticator app</h2>
            <p className="text-sm text-muted-foreground" data-testid="mfa-status">
              {factors.isLoading ? 'Checking...' : verified ? 'Two-step sign-in is on for your account.' : 'Not set up. Signing in needs only your password.'}
            </p>
            {mustUse && !verified && (
              <p className="mt-1 flex items-center gap-1 text-sm text-danger"><ShieldAlert className="h-4 w-4" aria-hidden /> Required for your role, {roleLabel(userRole)}.</p>
            )}
          </div>
          {verified && !mustUse && (
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)} disabled={removing} data-testid="button-mfa-remove">
              {removing && <Loader2 className="animate-spin" aria-hidden />} Turn off
            </Button>
          )}
        </div>

        {!verified && !enrolling && !factors.isLoading && (
          <Button onClick={() => setEnrolling(true)} data-testid="button-mfa-setup"><ShieldCheck /> Set up two-step sign-in</Button>
        )}
        {!verified && enrolling && (
          <EnrollPanel onDone={() => { setEnrolling(false); queryClient.invalidateQueries({ queryKey: ['mfa'] }); toast({ title: 'Two-step sign-in is on' }); }} />
        )}
        {verified && aal !== 'aal2' && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm text-muted-foreground">Confirm your code to manage two-step sign-in in this session.</p>
            <ChallengePanel />
          </div>
        )}
      </Card>

      {can(userRole, 'requireMfa') && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Require two-step sign-in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                When on, the CEO, HR, Finance and System Manager accounts must enter an authenticator code before they can see or change people, pay or audit records. The database enforces this, not just the screen.
              </p>
              {!verified && !requireMfa && <p className="mt-2 text-sm text-muted-foreground">Set up your own authenticator first, so you cannot lock yourself out.</p>}
              {requireMfa && <p className="mt-2 text-sm text-muted-foreground">The CEO can always turn this off again, even without a code, so a lost phone cannot lock the company out.</p>}
            </div>
            <Switch
              checked={requireMfa}
              disabled={setSetting.isPending || (!requireMfa && (!verified || aal !== 'aal2'))}
              onCheckedChange={toggleRequired}
              aria-label="Require two-step sign-in"
              data-testid="switch-require-mfa"
            />
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Turn off two-step sign-in?"
        description="Signing in will only need your password again."
        confirmLabel="Turn off"
        loading={removing}
        onConfirm={remove}
      />
    </div>
  );
}
