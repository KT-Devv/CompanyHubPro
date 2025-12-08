export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'destructive';
};

export function useToast() {
  const toast = (opts: ToastOptions = {}) => {
    // Minimal implementation: log to console. Replace with your UI toast in app.
    const { title, description, variant } = opts;
    // Keep the output small and consistent for tests/IDE
    // eslint-disable-next-line no-console
    console.log('[toast]', { title, description, variant });
  };

  return { toast };
}

export default useToast;
