import { useState, useEffect } from "react";
import { weeklyReportService } from "@/services/weeklyReportService";
import type { WeeklyReport } from "@/types";

export default function ReportsPage() {
  const [data, setData] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    weeklyReportService.getAll().then(setData).catch(setError).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Weekly Reports</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error: {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-5">
              <h3 className="font-bold text-lg mb-1">{r.candidate_name}</h3>
              <p className="text-muted-foreground text-sm mb-4">Week of {r.week_start_date}</p>
              
              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <div className="bg-muted p-2 rounded border border-border text-center">
                  <div className="font-bold text-foreground">{r.applications_submitted}</div>
                  <div className="text-xs text-muted-foreground">Apps</div>
                </div>
                <div className="bg-muted p-2 rounded border border-border text-center">
                  <div className="font-bold text-foreground">{r.recruiter_replies}</div>
                  <div className="text-xs text-muted-foreground">Replies</div>
                </div>
              </div>
              
              <button className="w-full py-2 bg-secondary/20 text-secondary border border-secondary/30 rounded-md text-sm font-medium hover:bg-secondary/30 transition-colors">
                View Report
              </button>
            </div>
          ))}
          {data.length === 0 && <div className="text-muted-foreground">No reports found.</div>}
        </div>
      )}
    </div>
  );
}
