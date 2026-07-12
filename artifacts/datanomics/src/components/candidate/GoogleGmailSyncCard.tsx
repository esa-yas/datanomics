import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  gmailSyncService,
  type ApplicationDailyCount,
  type GoogleConnectionPublic,
  type GmailSyncLog,
} from '@/services/gmailSyncService';
import { copyTextToClipboard } from '@/lib/utils/copyText';
import { getApplyMixInsight } from '@/lib/utils/applyMixInsight';
import {
  Link2,
  Copy,
  Unplug,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  connected: 'Connected',
  failed: 'Failed',
  disconnected: 'Disconnected',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  connected: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  disconnected: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const DATA_POLL_MS = 60 * 1000;

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatSyncLogSummary(log: GmailSyncLog): string {
  if (log.status === 'failed') return log.error_message ?? 'Failed';
  if (log.messages_imported > 0) {
    return `${log.messages_imported} new message${log.messages_imported === 1 ? '' : 's'}`;
  }
  if (log.messages_found > 0) {
    return `${log.messages_found} checked, none new`;
  }
  return 'Up to date';
}

function isObsoleteSyncError(message: string | null | undefined, logs: GmailSyncLog[]): boolean {
  if (!message) return false;
  const latest = logs[0];
  if (latest?.status !== 'success') return false;
  return (
    message.includes("does not support 'q'") ||
    message.includes('gmail_api_disabled')
  );
}

interface Props {
  candidateId: string;
  candidateName: string;
  readOnly?: boolean;
}

export function GoogleGmailSyncCard({ candidateId, candidateName, readOnly = false }: Props) {
  const [connection, setConnection] = useState<GoogleConnectionPublic | null>(null);
  const [daily, setDaily] = useState<ApplicationDailyCount | null>(null);
  const [logs, setLogs] = useState<GmailSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    try {
      const [conn, counts, syncLogs] = await Promise.all([
        gmailSyncService.getConnection(candidateId),
        gmailSyncService.getTodayCount(candidateId),
        gmailSyncService.getRecentSyncLogs(candidateId, 3),
      ]);
      setConnection(conn);
      setDaily(counts);
      setLogs(syncLogs);
      return conn;
    } catch (err) {
      if (!options?.quiet) {
        toast.error(err instanceof Error ? err.message : 'Failed to load Gmail sync');
      }
      return null;
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (connection?.status !== 'connected') return;
    const poll = setInterval(() => {
      void load({ quiet: true });
    }, DATA_POLL_MS);
    return () => clearInterval(poll);
  }, [connection?.status, load]);

  const handleGenerateLink = async () => {
    try {
      const { url } = await gmailSyncService.generateConnectLink(candidateId);
      setConnectUrl(url);
      try {
        await copyTextToClipboard(url);
        toast.success('Connect link copied to clipboard');
      } catch {
        toast.success('Connect link generated — use Copy to share');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate link');
    }
  };

  const handleCopyLink = async () => {
    if (!connectUrl) return;
    try {
      await copyTextToClipboard(connectUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link — select and copy manually');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect Google for ${candidateName}?`)) return;
    try {
      await gmailSyncService.disconnect(candidateId);
      toast.success('Google disconnected');
      setConnectUrl(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const mixInsight = useMemo(
    () =>
      getApplyMixInsight(
        daily?.linkedin_count ?? 0,
        daily?.dice_count ?? 0,
        daily?.other_count ?? 0,
      ),
    [daily?.linkedin_count, daily?.dice_count, daily?.other_count],
  );

  const status = connection?.status ?? 'disconnected';
  const goal = daily?.daily_goal ?? 30;
  const total = daily?.total_apply_count ?? 0;
  const remaining = daily?.remaining_count ?? Math.max(0, goal - total);
  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
  const lastSyncedAt = connection?.last_synced_at ?? daily?.last_synced_at ?? null;
  const showConnectionError =
    connection?.error_message &&
    !isObsoleteSyncError(connection.error_message, logs);

  if (loading) {
    return (
      <div className="bg-background rounded-lg border border-border p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Gmail sync…
      </div>
    );
  }

  return (
    <div className="bg-background rounded-lg border border-border p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Mail className="w-4 h-4" /> Gmail Apply Label Sync
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-syncs every 15 min on the server · metadata only · label &quot;Apply&quot;
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${STATUS_CLASS[status] ?? STATUS_CLASS.disconnected}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Connected email</div>
          <div className="font-medium truncate">{connection?.google_email ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Last synced</div>
          <div className="font-medium">{formatTime(lastSyncedAt)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Today</div>
          <div className="font-bold text-lg">
            {total} <span className="text-muted-foreground font-normal text-sm">/ {goal}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Remaining</div>
          <div className="font-bold text-lg text-primary">{remaining}</div>
        </div>
      </div>

      <Progress value={pct} className="h-2" />

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-md border border-border p-2">
          <div className="text-xs text-muted-foreground">LinkedIn (easy)</div>
          <div className="font-bold text-blue-400">{daily?.linkedin_count ?? 0}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-xs text-muted-foreground">Dice (easy)</div>
          <div className="font-bold text-purple-400">{daily?.dice_count ?? 0}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-xs text-muted-foreground">Direct / other</div>
          <div className="font-bold text-emerald-400">{daily?.other_count ?? 0}</div>
        </div>
      </div>

      {mixInsight && (
        <div
          className={`rounded-md border p-3 text-sm space-y-1 ${
            mixInsight.tone === 'warning'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              : mixInsight.tone === 'good'
                ? 'border-green-500/40 bg-green-500/10 text-green-100'
                : 'border-border bg-muted/40 text-muted-foreground'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-foreground">
            {mixInsight.tone === 'warning' ? (
              <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
            ) : mixInsight.tone === 'good' ? (
              <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
            ) : (
              <Minus className="w-4 h-4 shrink-0" />
            )}
            {mixInsight.title}
          </div>
          <p className="text-xs leading-relaxed">{mixInsight.detail}</p>
        </div>
      )}

      {showConnectionError && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {connection!.error_message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={handleGenerateLink} className="gap-2">
              <GoogleLogo className="w-4 h-4" />
              Generate Connect Link
            </Button>
            {connectUrl && (
              <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                <Copy className="w-4 h-4" /> Copy Link
              </Button>
            )}
            {status === 'connected' && (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2 text-destructive">
                <Unplug className="w-4 h-4" /> Disconnect
              </Button>
            )}
          </>
        )}
        {readOnly && status !== 'connected' && (
          <p className="text-xs text-muted-foreground w-full">
            Gmail connection is managed by your admin. Contact them to connect this candidate&apos;s inbox.
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={() => load()} className="gap-2">
          <Link2 className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {logs.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Recent syncs
          </div>
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {log.status === 'success' ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                ) : log.status === 'failed' ? (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {formatTime(log.sync_started_at)}
              </span>
              <span>{formatSyncLogSummary(log)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
