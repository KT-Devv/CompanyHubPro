// Pure rules for creating accounts. No Deno- or Node-specific imports, so the
// same file runs inside the edge function and in the unit tests.

export const ROLES = [
  'ceo',
  'hr',
  'finance',
  'system_manager',
  'project_manager',
  'supervisor',
  'logistics_manager',
  'store_manager',
  'secretary',
] as const;
export type Role = (typeof ROLES)[number];

// Who may create and manage accounts, and who must pass a second step when it is switched on.
export const ACCOUNT_ADMIN_ROLES: readonly string[] = ['ceo', 'system_manager'];
export const MFA_ROLES: readonly string[] = ['ceo', 'hr', 'finance', 'system_manager'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InviteInput {
  email: string;
  fullName: string;
  role: Role;
  siteId: string | null;
  storeId: string | null;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const optionalId = (v: unknown): string | null | undefined => {
  if (v == null || v === '') return null;
  return typeof v === 'string' && UUID.test(v) ? v : undefined;
};

// Checks the request body and the caller's authority. Never trusts the browser:
// the role the caller may hand out is decided here, not by what the form offered.
export function validateInvite(body: Record<string, unknown>, callerRole: string): Validation<InviteInput> {
  const email = text(body.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: 'Enter a valid email address.' };

  const fullName = text(body.full_name);
  if (fullName.length < 2 || fullName.length > 100) return { ok: false, error: "Enter the person's full name (2 to 100 characters)." };

  const role = text(body.role);
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: 'Choose a valid role.' };
  if (role === 'ceo' && callerRole !== 'ceo') return { ok: false, error: 'Only the CEO can create another CEO.' };

  const siteId = optionalId(body.site_id);
  const storeId = optionalId(body.store_id);
  if (siteId === undefined || storeId === undefined) return { ok: false, error: 'The site or store is not valid.' };

  // A supervisor works at one site and a store manager runs one store; without it they would see nothing.
  if (role === 'supervisor' && !siteId) return { ok: false, error: 'A supervisor must be assigned to a site.' };
  if (role === 'store_manager' && !storeId) return { ok: false, error: 'A store manager must be assigned to a store.' };

  return {
    ok: true,
    value: {
      email,
      fullName,
      role: role as Role,
      siteId: role === 'supervisor' ? siteId : null,
      storeId: role === 'store_manager' ? storeId : null,
    },
  };
}

export function validateBanToggle(body: Record<string, unknown>): Validation<{ userId: string; banned: boolean }> {
  const userId = text(body.user_id);
  if (!UUID.test(userId)) return { ok: false, error: 'Unknown user.' };
  if (typeof body.banned !== 'boolean') return { ok: false, error: 'Say whether to block or unblock the login.' };
  return { ok: true, value: { userId, banned: body.banned } };
}

// What the caller's token says about two-step sign-in. The function re-checks it
// because it uses a key that bypasses row-level security, which would otherwise
// skip the database's own two-step rule.
export function twoStepSatisfied(opts: { requireMfa: boolean; callerRole: string; aal: string | undefined }): boolean {
  if (!opts.requireMfa) return true;
  if (!MFA_ROLES.includes(opts.callerRole)) return true;
  return opts.aal === 'aal2';
}

// Constant-time string comparison, for shared secrets.
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// The "aal" claim from a JWT, without verifying it (the caller's token was
// already verified by auth.getUser before this is read).
export function aalFromJwt(token: string): string | undefined {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof json.aal === 'string' ? json.aal : undefined;
  } catch {
    return undefined;
  }
}
