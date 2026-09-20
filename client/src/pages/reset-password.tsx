import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { HardHat, Loader2, MailWarning } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/controls';

const MIN_LENGTH = 6;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The emailed link signs the user in with a short-lived recovery session.
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) setLinkInvalid(true);
      } catch {
        setLinkInvalid(true);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');

    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast({ title: 'Password updated', description: 'Please sign in with your new password.' });
      await supabase.auth.signOut();
      setLocation('/login');
    } catch (err: any) {
      setError(err?.message || 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-alabaster px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <HardHat className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">SiteTrack</span>
        </div>

        {!ready ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your link
          </p>
        ) : linkInvalid ? (
          <div className="space-y-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
              <MailWarning className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">This link has expired</h1>
              <p className="mt-1 text-sm text-muted-foreground">Reset links work once and only for a short time. Request a new one from the sign-in page.</p>
            </div>
            <Button className="w-full" onClick={() => setLocation('/login')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold">Choose a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">You'll be asked to sign in again afterwards.</p>
            </div>
            <Field label="New password" htmlFor="new-password" hint={`At least ${MIN_LENGTH} characters.`}>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={saving} autoFocus />
            </Field>
            <Field label="Confirm password" htmlFor="confirm-password">
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={saving} />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
