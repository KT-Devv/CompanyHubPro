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
