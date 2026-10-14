import { CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

interface Props {
  online: boolean;
  waiting: number;
  syncing: boolean;
  onSync: () => void;
}

const plural = (n: number) => `${n} attendance mark${n === 1 ? '' : 's'}`;

// A thin strip under the top bar that only appears when something needs saying:
// no connection, running from the saved copy, or marks waiting to be sent.
export function SyncStatus({ online, waiting, syncing, onSync }: Props) {
  const { offlineSession } = useAuth();
  if (online && !waiting && !offlineSession) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-alabaster px-4 py-2 text-sm sm:px-6"
      role="status"
      aria-live="polite"
      data-testid="sync-status"
    >
      <span className="flex items-center gap-2 text-foreground/80">
        {online ? <RefreshCw className="h-4 w-4 text-brand" aria-hidden /> : <CloudOff className="h-4 w-4 text-crimson" aria-hidden />}
        {!online
          ? waiting
            ? `You are offline. ${plural(waiting)} saved on this phone, to be sent when the connection returns.`
            : 'You are offline. Attendance you mark is saved on this phone and sent when the connection returns.'
          : syncing
            ? `Sending ${plural(waiting)}...`
            : waiting
              ? `${plural(waiting)} waiting to be sent.`
              : 'Reconnecting...'}
      </span>
      {online && waiting > 0 && (
        <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} data-testid="button-sync-now">
          {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw />} Send now
        </Button>
      )}
    </div>
  );
}
