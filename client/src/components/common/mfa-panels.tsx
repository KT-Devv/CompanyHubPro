import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { mfaErrorMessage, startEnrollment, verifiedFactorId, verifyCode, type Enrollment } from '@/lib/api/mfa';

// Digits only, big, easy to tap.
function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      maxLength={6}
      className="num h-12 text-center text-xl tracking-[0.4em]"
      autoFocus
      data-testid="input-mfa-code"
    />
  );
}

// Enter the 6-digit code from the authenticator app to finish signing in.
export function ChallengePanel({ onDone }: { onDone?: () => void }) {
  const { refreshAssurance } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const factorId = await verifiedFactorId();
      if (!factorId) throw new Error('No authenticator app is set up on this account.');
      await verifyCode(factorId, code);
      await refreshAssurance();
      onDone?.();
    } catch (err) {
      setError(mfaErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mfa-code">6-digit code</Label>
        <CodeInput id="mfa-code" value={code} onChange={setCode} />
        <p className="text-xs text-muted-foreground">Open your authenticator app and enter the current code for SiteTrack.</p>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6} data-testid="button-mfa-verify">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck />} Verify
      </Button>
    </form>
  );
}

// Scan the QR code (or type the key) into an authenticator app, then prove it
// works by entering a code.
export function EnrollPanel({ onDone }: { onDone?: () => void }) {
  const { refreshAssurance } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startEnrollment()
      .then((e) => { if (!cancelled) setEnrollment(e); })
      .catch((err) => { if (!cancelled) setError(mfaErrorMessage(err)); });
    return () => { cancelled = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(enrollment.factorId, code);
      await refreshAssurance();
      onDone?.();
    } catch (err) {
      setError(mfaErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (!enrollment) {
    return error ? <p className="text-sm text-danger" role="alert">{error}</p> : <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</li>
        <li>Scan this code with it, or type the key in by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        <img src={enrollment.qrCode} alt="QR code to scan with your authenticator app" className="h-40 w-40 rounded-lg border border-border bg-white p-2" />
        <code className="select-all break-all rounded-md bg-alabaster px-2 py-1 text-xs" data-testid="mfa-secret">{enrollment.secret}</code>
      </div>
      <div className="space-y-2">
        <Label htmlFor="enroll-code">6-digit code</Label>
        <CodeInput id="enroll-code" value={code} onChange={setCode} />
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6} data-testid="button-mfa-enroll-verify">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck />} Turn on two-step sign-in
      </Button>
    </form>
  );
}
