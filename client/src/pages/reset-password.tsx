import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setSessionError(true);
        }
      } catch {
        setSessionError(true);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Please sign in with your new password.' });
      await supabase.auth.signOut();
      setLocation('/login');
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update password', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md bg-card rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-2">Set a new password</h2>
        <p className="text-sm text-muted-foreground mb-4">Enter a new password for your account.</p>
        {!ready ? (
          <div className="text-center">Preparing…</div>
        ) : sessionError ? (
          <div className="text-center text-destructive">
            <p>Invalid or expired reset link.</p>
            <p className="text-sm mt-2">Please request a new password reset.</p>
            <Button className="mt-4" onClick={() => setLocation('/login')}>Go to Login</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={loading}>{loading ? 'Updating…' : 'Update password'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
