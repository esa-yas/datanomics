import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { gmailSyncService, type ApplicationDailyCount } from '@/services/gmailSyncService';
import { useDataReady } from '@/hooks/useDataReady';
import { Mail, Target } from 'lucide-react';

type CountWithName = ApplicationDailyCount & {
  candidates?: { full_name: string } | null;
};

export function GmailApplyDashboardSection() {
  const ready = useDataReady();
  const [rows, setRows] = useState<CountWithName[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    gmailSyncService
      .getAllTodayCounts()
      .then((data) => setRows(data as CountWithName[]))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [ready]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Today&apos;s Gmail Apply Counts
        </h2>
        <span className="text-xs text-muted-foreground">Daily goal: 30</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
              <th className="pb-2 pr-4">Candidate</th>
              <th className="pb-2 pr-4">Today</th>
              <th className="pb-2 pr-4">Remaining</th>
              <th className="pb-2 pr-4">LinkedIn</th>
              <th className="pb-2 pr-4">Dice</th>
              <th className="pb-2 pr-4">Other</th>
              <th className="pb-2">Last synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/candidates/${row.candidate_id}`} className="hover:text-primary hover:underline">
                    {row.candidates?.full_name ?? row.candidate_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <span className="font-bold">{row.total_apply_count}</span>
                  <span className="text-muted-foreground"> / {row.daily_goal}</span>
                </td>
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center gap-1 text-primary font-semibold">
                    <Target className="w-3 h-3" />
                    {row.remaining_count}
                  </span>
                </td>
                <td className="py-2 pr-4 text-blue-400">{row.linkedin_count}</td>
                <td className="py-2 pr-4 text-purple-400">{row.dice_count}</td>
                <td className="py-2 pr-4">{row.other_count}</td>
                <td className="py-2 text-xs text-muted-foreground">
                  {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
