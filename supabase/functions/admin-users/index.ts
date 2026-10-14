// Creates and blocks logins. This needs the Supabase auth admin API (a secret
// key that must never reach the browser), so it lives here. Everything else
// about an account (role, site, active) goes through the rpc_admin_update_user
// database function.
//
// Deploy:  supabase functions deploy admin-users
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided
//          by Supabase. Set APP_URL (e.g. https://app.example.com) so invitation
//          links come back to the app, and optionally APP_ORIGIN to lock CORS.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ACCOUNT_ADMIN_ROLES, aalFromJwt, twoStepSatisfied, validateBanToggle, validateInvite } from '../_shared/accounts.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const allowedOrigin = Deno.env.get('APP_ORIGIN') ?? '*';

const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  // ---- who is asking? Verified with Supabase, never taken from the request body.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'Sign in first.' });
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await asCaller.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: 'Your session has expired. Sign in again.' });
  const callerId = authData.user.id;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin.from('users').select('role, is_active').eq('id', callerId).maybeSingle();
  if (!profile || !profile.is_active || !ACCOUNT_ADMIN_ROLES.includes(profile.role)) {
    return reply(403, { error: 'Only the CEO or a system manager can manage accounts.' });
  }

  // This function bypasses row-level security, so the two-step rule is re-checked here.
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'require_mfa').maybeSingle();
  if (!twoStepSatisfied({ requireMfa: setting?.value === 'true', callerRole: profile.role, aal: aalFromJwt(token) })) {
    return reply(403, { error: 'Confirm your two-step code first.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The request could not be read.' });
  }

  // ---- invite
  if (body.action === 'invite') {
    const v = validateInvite(body, profile.role);
    if (!v.ok) return reply(400, { error: v.error });
    const { email, fullName, role, siteId, storeId } = v.value;

    const { data: existing } = await admin.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return reply(409, { error: 'An account with that email already exists.' });

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: appUrl ? `${appUrl}/reset-password` : undefined,
    });
    if (inviteError || !invited.user) {
      const already = /already|registered|exists/i.test(inviteError?.message ?? '');
      return reply(already ? 409 : 502, { error: already ? 'That email already has a login. Ask an administrator to add its profile.' : 'The invitation email could not be sent. Try again shortly.' });
    }
    const newId = invited.user.id;

    // The profile is what grants access. If it cannot be written, remove the
    // login again so nobody is left with a login that does nothing.
    const { error: profileError } = await admin.from('users').insert({ id: newId, email, full_name: fullName, role, site_id: siteId, store_id: storeId, is_active: true });
    if (profileError) {
      await admin.auth.admin.deleteUser(newId).catch(() => undefined);
      return reply(500, { error: 'The account could not be created. Nothing was changed.' });
    }

    // The database trigger records the insert with no person attached (this runs
    // with a service key), so record who invited them.
    await admin.from('audit_log').insert({ changed_by: callerId, table_name: 'account_invites', row_id: newId, action: 'INSERT', new_data: { email, role, site_id: siteId, store_id: storeId } });
    return reply(200, { id: newId, email });
  }

  // ---- block / unblock a login (the database already cuts data access when is_active is false)
  if (body.action === 'sync_ban') {
    const v = validateBanToggle(body);
    if (!v.ok) return reply(400, { error: v.error });
    if (v.value.userId === callerId) return reply(400, { error: 'You cannot block your own login.' });
    const { data: target } = await admin.from('users').select('role').eq('id', v.value.userId).maybeSingle();
    if (!target) return reply(404, { error: 'Unknown user.' });
    if (target.role === 'ceo' && profile.role !== 'ceo') return reply(403, { error: 'Only the CEO can block a CEO.' });
    const { error } = await admin.auth.admin.updateUserById(v.value.userId, { ban_duration: v.value.banned ? '876000h' : 'none' });
    if (error) return reply(502, { error: 'The login could not be updated.' });
    return reply(200, { ok: true });
  }

  return reply(400, { error: 'Unknown action.' });
});
