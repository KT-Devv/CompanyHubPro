// Error monitoring. Set VITE_SENTRY_DSN to send crashes and unexpected errors to
// Sentry; with it unset nothing is sent anywhere and errors only go to the
// browser console. The Sentry code is a separate download that is only fetched
// when a DSN is configured, so it costs nothing otherwise.
type SentryModule = typeof import('@sentry/react');
let sentry: SentryModule | undefined;

export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: (import.meta.env.VITE_APP_ENV as string | undefined) ?? import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION as string | undefined,
      // Errors only: no performance traces, session replays, or personal data.
      // (Personal data is not attached by default.)
      tracesSampleRate: 0,
      // Network blips are normal on a building site and not bugs worth paging anyone about.
      ignoreErrors: [/failed to fetch/i, /networkerror/i, /load failed/i, /ResizeObserver loop/i],
    });
    sentry = Sentry;
  } catch (error) {
    console.warn('Error monitoring could not start:', error);
  }
}

// Who hit the problem: an opaque id and role, never a name or email.
export function setMonitoringUser(user: { id: string; role: string | null } | null): void {
  sentry?.setUser(user ? { id: user.id } : null);
  sentry?.setTag('role', user?.role ?? 'none');
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error(error);
  sentry?.captureException(error, context ? { extra: context } : undefined);
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, { source: 'window.onerror' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'unhandledrejection' }));
}
