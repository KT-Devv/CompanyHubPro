import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
  /** Shown instead of the page, e.g. inside one screen so the sidebar stays usable. */
  compact?: boolean;
}

// If a screen crashes, show a calm message and a way back instead of a blank page.
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.compact ? 'flex min-h-[50vh] items-center justify-center p-6' : 'flex min-h-screen items-center justify-center bg-background p-6'} role="alert">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted-foreground">This screen hit an unexpected problem. Nothing you saved has been lost. Reloading usually fixes it.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw /> Reload
            </Button>
            <Button variant="outline" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
