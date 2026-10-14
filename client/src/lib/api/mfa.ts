import { supabase } from '../supabase';

export interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export interface Factor {
  id: string;
  status: 'verified' | 'unverified';
  friendly_name?: string | null;
}

export async function listTotpFactors(): Promise<Factor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return ((data?.all ?? []) as (Factor & { factor_type: string })[]).filter((f) => f.factor_type === 'totp');
}

// Starts setting up an authenticator app. A half-finished earlier attempt would
// block a new one, so those are cleared first.
export async function startEnrollment(): Promise<Enrollment> {
  for (const f of await listTotpFactors()) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// Checks a 6-digit code; on success this sign-in is upgraded to the stronger level.
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) throw error;
}

export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export async function verifiedFactorId(): Promise<string | null> {
  return (await listTotpFactors()).find((f) => f.status === 'verified')?.id ?? null;
}

export function mfaErrorMessage(error: unknown): string {
  const message = String((error as { message?: string } | null)?.message ?? '');
  if (/invalid.*(code|totp)|incorrect/i.test(message)) return 'That code is not right. Check the code in your authenticator app and try again.';
  if (/expired/i.test(message)) return 'That code has expired. Enter the newest code from your authenticator app.';
  if (/aal2|assurance/i.test(message)) return 'Confirm your two-step code first, then try again.';
  return message || 'Something went wrong. Please try again.';
}
