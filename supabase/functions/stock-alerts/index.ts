// Tells people when stock reaches its reorder level. Run it on a schedule (see
// supabase/README.md); each run alerts once per dip: an item that is already
// flagged is not announced again until it has been restocked.
//
// Deploy:  supabase functions deploy stock-alerts --no-verify-jwt
// Secrets: CRON_SECRET (required: callers must send "Authorization: Bearer <it>")
//          RESEND_API_KEY + ALERT_EMAIL_FROM + ALERT_EMAIL_TO (comma-separated) for email
//          ALERT_WEBHOOK_URL for a Slack/Teams/WhatsApp relay (optional, either or both)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeEqual } from '../_shared/accounts.ts';
import { buildAlert, needsAlert, needsReset, webhookPayload, type StockItem } from '../_shared/stock.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
const resendKey = Deno.env.get('RESEND_API_KEY');
const emailFrom = Deno.env.get('ALERT_EMAIL_FROM');
const emailTo = (Deno.env.get('ALERT_EMAIL_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const webhookUrl = Deno.env.get('ALERT_WEBHOOK_URL');

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function loadItems(admin: ReturnType<typeof createClient>): Promise<StockItem[]> {
  const items: StockItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('inventory')
      .select('id, item_name, quantity, min_quantity, low_alerted_at, stores(name)')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read inventory: ${error.message}`);
    for (const r of data ?? []) {
      items.push({ id: r.id, item_name: r.item_name, quantity: r.quantity, min_quantity: r.min_quantity, low_alerted_at: r.low_alerted_at, store_name: (r as { stores?: { name?: string } }).stores?.name ?? 'Store' });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return reply(405, { error: 'Use POST.' });
  // Without a secret configured, nobody may run this: it would be open to the internet.
  if (!cronSecret) return reply(500, { error: 'CRON_SECRET is not set for this function.' });
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(given, cronSecret)) return reply(401, { error: 'Not allowed.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const items = await loadItems(admin);
    const fresh = needsAlert(items);
    const restocked = needsReset(items);
    const message = buildAlert(fresh);
    const delivered: string[] = [];
    const failed: string[] = [];

    if (message) {
      if (resendKey && emailFrom && emailTo.length) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: emailFrom, to: emailTo, subject: message.subject, text: message.text, html: message.html }),
        }).catch(() => null);
        (res?.ok ? delivered : failed).push('email');
      }
      if (webhookUrl) {
        const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(webhookPayload(fresh, message)) }).catch(() => null);
        (res?.ok ? delivered : failed).push('webhook');
      }
      // Only mark items as announced if somebody was actually told, so a failed
      // send is retried on the next run instead of being silently dropped.
      if (delivered.length) await admin.from('inventory').update({ low_alerted_at: new Date().toISOString() }).in('id', fresh.map((i) => i.id));
    }
    if (restocked.length) await admin.from('inventory').update({ low_alerted_at: null }).in('id', restocked.map((i) => i.id));

    return reply(200, {
      low_items: fresh.length,
      delivered,
      failed,
      configured: { email: !!(resendKey && emailFrom && emailTo.length), webhook: !!webhookUrl },
      reset: restocked.length,
    });
  } catch (error) {
    return reply(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
});
