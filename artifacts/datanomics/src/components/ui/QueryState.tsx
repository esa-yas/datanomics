import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/dbError';
import { RefreshCw } from 'lucide-react';

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-md" />
      ))}
    </div>
  );
}

export function QueryError({
  error,
  onRetry,
  label,
}: {
  error: unknown;
  onRetry?: () => void;
  label?: string;
}) {
  return (
    <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 space-y-3">
      <p>
        {label ? `${label}: ` : ''}
        {friendlyError(error)}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="border-destructive/30">
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function FetchingHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Updating…
    </p>
  );
}
