import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { useDashboard } from "@/hooks/useData";
import type { DashboardData } from "@/services/dashboardService";
import { GmailApplyDashboardSection } from "@/components/dashboard/GmailApplyDashboardSection";

const EMPTY_DASHBOARD: DashboardData = {
  stats: {
    totalCandidates: 0,
    activeSearches: 0,
    placed: 0,
    totalApplications: 0,
    appsThisWeek: 0,
    appliedToday: 0,
  },
  statusPipeline: [],
  appsPerDay: [],
  sourceBreakdown: [],
  topCandidates: [],
  recentApps: [],
};
import { useDataReady } from "@/hooks/useDataReady";
import { QueryError, FetchingHint, ListSkeleton } from "@/components/ui/QueryState";
import { Users, Briefcase, CheckCircle, TrendingUp, Send, CalendarCheck } from "lucide-react";

const DashboardCharts = lazy(() => import("@/components/dashboard/DashboardCharts"));

export default function DashboardPage() {
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useDashboard();
  const dashboard = data ?? EMPTY_DASHBOARD;

  if (!ready || isPending) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
        <QueryError error={error} onRetry={() => refetch()} label="Failed to load dashboard" />
      </div>
    );
  }

  const { stats, statusPipeline, appsPerDay, sourceBreakdown, topCandidates, recentApps } = dashboard;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
      </div>

      <FetchingHint show={isFetching && isFetched} />

      <GmailApplyDashboardSection />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Candidates", value: stats.totalCandidates, icon: Users, color: "text-blue-400" },
          { label: "Active Searches", value: stats.activeSearches, icon: TrendingUp, color: "text-teal-400" },
          { label: "Placed", value: stats.placed, icon: CheckCircle, color: "text-green-400" },
          { label: "Total Applications", value: stats.totalApplications, icon: Send, color: "text-sky-400" },
          { label: "Apps This Week", value: stats.appsThisWeek, icon: Briefcase, color: "text-purple-400" },
          { label: "Applied Today", value: stats.appliedToday, icon: CalendarCheck, color: "text-emerald-400" },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 card-hover">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className="text-2xl font-display font-bold text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[380px] bg-muted/30 rounded-lg border border-border animate-pulse" />
            ))}
          </div>
        }
      >
        <DashboardCharts
          statusPipeline={statusPipeline}
          appsPerDay={appsPerDay}
          sourceBreakdown={sourceBreakdown}
          topCandidates={topCandidates}
        />
      </Suspense>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
          <h2 className="text-lg font-display font-semibold">Recent Applications</h2>
          <Link href="/applications" className="text-sm text-primary hover:underline font-medium">
            View All
          </Link>
        </div>
        {recentApps.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">No applications logged yet.</p>
        ) : (
          <table className="w-full text-left text-sm text-foreground">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Quality</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentApps.map((app) => (
                <tr key={app.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/candidates/${app.candidate_id}`}
                      className="font-medium text-secondary hover:underline"
                    >
                      {app.candidate_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">{app.company}</td>
                  <td className="px-4 py-3">{app.job_title}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border capitalize">
                      {app.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-24 h-2 rounded-full bg-background overflow-hidden">
                      <div
                        className={`h-full ${app.quality_score >= 80 ? "bg-primary" : app.quality_score >= 60 ? "bg-yellow-400" : "bg-destructive"}`}
                        style={{ width: `${app.quality_score}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(app.applied_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
