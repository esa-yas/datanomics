import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDataReady } from '@/hooks/useDataReady';
import { probeDataAccess, type DataAccessStatus } from '@/lib/dataAccessProbe';
import { AlertTriangle, X } from 'lucide-react';

export default function DataAccessBanner() {
  const ready = useDataReady();
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<DataAccessStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ready || !user?.id) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    probeDataAccess(user.id, user.email).then((s) => {
      if (!cancelled) setStatus(s);
    });

    return () => {
      cancelled = true;
    };
  }, [ready, user?.id, user?.email, user?.role]);

  if (dismissed || !status) return null;

  const showFix =
    status.needsAdminPromotion ||
    !status.canReadCandidates ||
    status.profileRole === 'client' ||
    !!status.probeError?.includes('infinite recursion');

  if (!showFix) return null;

  return (
    <div className="border-b border-destructive/30 bg-destructive/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold text-destructive">Database access needs a one-time fix</p>
          <p className="text-destructive/80 mt-1 text-xs leading-relaxed">
            Your login profile role is{' '}
            <code className="bg-muted px-1 rounded">{status.profileRole ?? 'unknown'}</code>.
            {status.needsAdminPromotion && (
              <> For full access, run </>
            )}
            {!status.needsAdminPromotion && <> Run </>}
            <code className="bg-muted px-1 rounded">supabase/fix-rls-recursion.sql</code> then{' '}
            <code className="bg-muted px-1 rounded">supabase/ensure-admin-profile.sql</code> in the
            Supabase SQL Editor, then hard-refresh this page. Without this, saved candidates disappear
            after refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 text-destructive/60 hover:text-destructive"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
