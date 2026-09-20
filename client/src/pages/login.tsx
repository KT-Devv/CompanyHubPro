import { useState } from 'react';
import { ClipboardCheck, Eye, EyeOff, HardHat, Loader2, PackageCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase, isDemo } from '@/lib/supabase';
import { ALL_ROLES, ROLE_LABEL } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/common/controls';

const FEATURES = [
  { icon: ClipboardCheck, title: 'Attendance in two taps', text: 'Supervisors mark a whole site in seconds, from a phone.' },
  { icon: Wallet, title: 'Payroll that adds up', text: 'Days worked, deductions and net pay, calculated the same way every month.' },
  { icon: PackageCheck, title: 'Stock you can trust', text: 'Every transfer is logged, matched on arrival and flagged if the count is off.' },
];

// A quiet illustration made of white cards, so the panel isn't just text.
function BrandArt() {
  const rows = [
    { name: 'Kwame Mensah', tag: 'Present' },
    { name: 'Ama Boateng', tag: 'Present' },
    { name: 'Yaw Owusu', tag: 'Half day' },
  ];
  return (
    <div aria-hidden className="relative mx-auto mt-10 h-56 w-full max-w-sm">
      <div className="absolute inset-x-6 top-0 h-40 rounded-2xl border border-border bg-ivory/70" />
      <div className="absolute inset-x-3 top-4 h-40 rounded-2xl border border-border bg-alabaster shadow-xs" />
      <div className="absolute inset-x-0 top-8 rounded-2xl border border-border bg-card p-4 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Today</span>
          <span className="num text-xs font-medium">42 / 48 marked</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-pearl">
          <div className="h-full w-[87%] rounded-full bg-primary" />
        </div>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between rounded-lg bg-alabaster px-3 py-2 text-sm">
              <span>{r.name}</span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">{r.tag}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const siteUrl = (import.meta.env.VITE_SITE_URL as string) || window.location.origin;

  async function attemptSignIn(nextEmail: string, nextPassword: string) {
    setSubmitting(true);
    setError(null);
    try {
      await signIn(nextEmail, nextPassword);
    } catch (err: any) {
      setError(err?.message || 'Could not sign in. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void attemptSignIn(email.trim(), password);
  }

  async function sendReset() {
    setSendingReset(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${siteUrl}/reset-password`,
      });
      if (resetError) throw resetError;
      toast({ title: 'Check your email', description: 'If an account exists for that address, a reset link is on its way.' });
      setForgotOpen(false);
      setForgotEmail('');
    } catch (err: any) {
      toast({ title: 'Could not send the link', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSendingReset(false);
    }
  }

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim());

  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-alabaster p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <HardHat className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">SiteTrack</span>
        </div>

        <div>
          <h2 className="max-w-md text-4xl font-semibold leading-[1.1] tracking-tight">Every site. Every worker. On the record.</h2>
          <BrandArt />
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-xs">
                  <f.icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} SiteTrack</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <HardHat className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight">SiteTrack</span>
          </div>

          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={submitting}
                data-testid="input-email"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-ivory hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error && (
              <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || !email || !password} data-testid="button-login">
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              {submitting ? 'Signing in' : 'Sign in'}
            </Button>

            <div className="text-center">
              <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setForgotOpen(true)}>
                Forgot your password?
              </button>
            </div>
          </form>

          {isDemo && (
            <div className="mt-8 rounded-xl border border-border bg-alabaster p-4" data-testid="demo-roles">
              <p className="text-sm font-medium">Demo mode</p>
              <p className="mb-3 text-xs text-muted-foreground">Sample data only. Nothing here touches a real database. Sign in as:</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((role) => (
                  <Button key={role} type="button" variant="outline" size="sm" disabled={submitting} onClick={() => attemptSignIn(`${role}@demo.local`, 'demo')} data-testid={`demo-${role}`}>
                    {ROLE_LABEL[role]}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <Dialog open={forgotOpen} onOpenChange={(open) => { setForgotOpen(open); if (!open) setForgotEmail(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your account email and we'll send you a link to choose a new password.</DialogDescription>
          </DialogHeader>
          <Field label="Email" htmlFor="forgot-email">
            <Input id="forgot-email" type="email" placeholder="you@company.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} disabled={sendingReset} />
          </Field>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setForgotOpen(false)} disabled={sendingReset}>
              Cancel
            </Button>
            <Button onClick={sendReset} disabled={sendingReset || !emailLooksValid}>
              {sendingReset && <Loader2 className="animate-spin" aria-hidden />}
              Send link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
