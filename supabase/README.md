# Supabase edge functions

Two small server-side functions. Everything else in the app talks to the
database directly from the browser, with row-level security as the access
control. These two exist only because they need a secret key that must never
reach the browser.

| Function | What it does | Who can call it |
| --- | --- | --- |
| `admin-users` | Invites a new person (creates their login and profile) and blocks / unblocks a login | Signed-in CEO or System Manager only (checked on the server) |
| `stock-alerts` | Emails (and/or posts to a webhook) when items reach their reorder level | Anyone holding `CRON_SECRET` (the scheduler) |

> **Status:** the pure rules in `_shared/` (who may invite whom, input checks,
> alert selection and wording) are unit-tested (`npm test`). The functions
> themselves, and the email/webhook delivery, **have not been run against a
> live Supabase project or a real mail account**. Deploy to staging first
> (`.env.staging.example`) and try them there.

## Deploy

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the repository root:

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy admin-users
supabase functions deploy stock-alerts --no-verify-jwt   # called by a scheduler, protected by CRON_SECRET instead
```

### Secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
to functions automatically. Set the rest:

```bash
# admin-users
supabase secrets set APP_URL=https://your-app.example.com        # invitation links come back here
supabase secrets set APP_ORIGIN=https://your-app.example.com     # optional: locks CORS to your app

# stock-alerts
supabase secrets set CRON_SECRET=<a long random string>
supabase secrets set RESEND_API_KEY=re_...                      # email via resend.com
supabase secrets set ALERT_EMAIL_FROM="SiteTrack <alerts@your-domain.com>"   # a verified sender on your Resend account
supabase secrets set ALERT_EMAIL_TO="stores@your-domain.com,ceo@your-domain.com"
supabase secrets set ALERT_WEBHOOK_URL=https://hooks.example.com/...   # optional: Slack/Teams/WhatsApp relay
```

Email, the webhook, or both can be configured. If neither is, `stock-alerts`
reports `configured: {email: false, webhook: false}` and marks nothing as sent.

In **Authentication > URL configuration**, add `APP_URL` and `APP_URL/reset-password`
to the allowed redirect URLs, or invitation links will be refused.

### Schedule the stock alerts

Run it hourly (or as often as you like). It alerts **once per dip**: an item
already flagged is not announced again until it has been restocked above its
reorder level. Changing an item's reorder level resets its flag.

In the SQL editor (needs the `pg_cron` and `pg_net` extensions enabled):

```sql
select cron.schedule(
  'stock-alerts-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url     := 'https://<project-ref>.supabase.co/functions/v1/stock-alerts',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json')
     ); $$
);
```

Try it by hand first:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/stock-alerts \
  -H "Authorization: Bearer <CRON_SECRET>"
# {"low_items":2,"delivered":["email"],"failed":[],"configured":{"email":true,"webhook":false},"reset":0}
```

## How `admin-users` stays safe

- The caller is identified by their verified Supabase session, never by anything in the request body.
- It re-checks the caller is an active CEO or System Manager, and that the two-step sign-in rule is met (this function bypasses row-level security, so it cannot rely on it).
- Only the CEO can create a CEO. A supervisor needs a site, a store manager a store.
- If the profile row cannot be written after the login is created, the login is deleted again (nobody is left with a login that does nothing).
- Who invited whom is written to the audit log (`account_invites`).

Passwords are never set or seen by an administrator: the new person gets an email to choose their own.
