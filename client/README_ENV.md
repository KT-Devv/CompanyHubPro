Local env for client

This project uses Vite with the `client` folder set as the Vite root. For local development put your environment variables in `client/.env`.

Steps:

1. Copy `client/.env.example` to `client/.env`.
2. Replace the placeholder values with your Supabase project URL and anon key.
3. Restart the dev server if it's running.

Notes:
- `client/.env` is ignored by Git (listed in the repository `.gitignore`).
- Vite exposes variables to the browser only if they are prefixed with `VITE_`.
- Never commit your real keys. Use `client/.env.example` as the template.

## Demo mode (no database needed)

```
npm run dev:demo
```

Runs the whole UI on in-memory sample data. The login page shows a button per role so you can see each role's screens. Changes are lost on reload and nothing touches Supabase. Demo code is a build-time switch (`VITE_DEMO`) and is not included in production builds.


## Optional settings

| Variable | Effect |
| --- | --- |
| `VITE_SENTRY_DSN` | Send crashes and unexpected errors to Sentry. Unset (the default): nothing is sent anywhere and Sentry's code is not even in the build. Set it **when building**, not just at runtime. |
| `VITE_APP_ENV` | Label shown on error reports (`production`, `staging`). Defaults to the build mode. |
| `VITE_APP_VERSION` | Release label on error reports, e.g. a git SHA. |

Errors are sent without personal data (an opaque user id and role only), and ordinary network blips are not reported.

## Company logo on documents

Payslips, bank files and reports carry the company name as a text wordmark. To
use the real logo, save it as `client/public/company-logo.png` (a PNG at least
~600px wide; it is placed on a white tile on the navy header). No code change needed.

## Installing as an app / working offline

In production builds the app is installable (phone: "Add to home screen") and
opens with no signal. Attendance marked offline is kept on the phone and sent
automatically when the connection returns. The service worker and offline copy
are switched off in development and demo mode.

## Staging

See `.env.staging.example` at the repository root, and `npm run migrate` /
`npm run migrate:staging` (`scripts/migrate.mjs`) to build a staging database.
