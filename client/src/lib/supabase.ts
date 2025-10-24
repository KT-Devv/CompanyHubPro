import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function mask(value?: string) {
  if (!value) return '<missing>';
  return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : '••••';
}

// Export a supabase client. In development we prefer a helpful console message
// and a stub that throws with a clear message if the env vars are missing.
let _supabase: any;
if (!supabaseUrl || !supabaseAnonKey) {
  const info = `VITE_SUPABASE_URL=${supabaseUrl ? supabaseUrl : '<missing>'}, VITE_SUPABASE_ANON_KEY=${mask(supabaseAnonKey)}`;
  if (import.meta.env.DEV) {
    // Helpful dev-time log — not exposing full secret
    // eslint-disable-next-line no-console
    console.error('[supabase] Missing env variables. ' + info + '\nPlease copy `client/.env.example` to `client/.env` and set your keys.');

    // A stub that throws when any property is accessed, to avoid unexpected crashes
    const stub = new Proxy({}, {
      get() {
        return () => {
          throw new Error('Supabase is not configured. See client/.env (development)');
        };
      },
    });

    _supabase = stub;
  } else {
    // In production, fail fast so deployment doesn't silently misbehave
    throw new Error('Missing Supabase environment variables');
  }
} else {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = _supabase;
