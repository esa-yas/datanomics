import { useState, useEffect } from "react";
import { Link } from "wouter";
import { candidateService } from "@/services/candidateService";
import { applicationService } from "@/services/applicationService";
import { recruiterMessageService } from "@/services/recruiterMessageService";
import { Users, Briefcase, CheckCircle, MessageSquare, Clock, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalCandidates: 0,
    activeSearches: 0,
    placed: 0,
    appsThisWeek: 0,
    replyRate: 0,
    pendingMessages: 0,
  });
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [statusPipeline, setStatusPipeline] = useState<any[]>([]);
  const [appsPerDay, setAppsPerDay] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const cands = await candidateService.getAll();
        const apps = await applicationService.getThisWeek();
        const unread = await recruiterMessageService.getUnread();
        
        const active = cands.filter(c => ['lead', 'profile_setup', 'application_started', 'active_search', 'interview_stage', 'offer_received'].includes(c.status));
        const placed = cands.filter(c => c.status === 'placed');
        
        setStats({
          totalCandidates: cands.length,
          activeSearches: active.length,
          placed: placed.length,
          appsThisWeek: apps.length,
          replyRate: 15, // Mocked for now
          pendingMessages: unread.length,
        });

        const statusCounts = cands.reduce((acc: any, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {});
        setStatusPipeline(Object.entries(statusCounts).map(([name, value]) => ({ name: name.replace(/_/g, ' '), count: value })));

        // Mock chart data
        const mockAppsPerDay = Array.from({ length: 14 }).map((_, i) => ({
          date: new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          apps: Math.floor(Math.random() * 20) + 5
        }));
        setAppsPerDay(mockAppsPerDay);

        const allApps = await applicationService.getAll({ limit: 10 });
        setRecentApps(allApps);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
      </div>

      {stats.pendingMessages > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <MessageSquare className="text-destructive mt-0.5" />
          <div>
            <h3 className="font-semibold text-destructive">Pending Messages</h3>
            <p className="text-sm text-destructive/80">You have {stats.pendingMessages} unread recruiter messages that need attention.</p>
          </div>
          <Link href="/messages" className="ml-auto text-sm font-medium text-destructive hover:underline">
            View Messages →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Candidates", value: stats.totalCandidates, icon: Users, color: "text-blue-400" },
          { label: "Active Searches", value: stats.activeSearches, icon: TrendingUp, color: "text-teal-400" },
          { label: "Placed", value: stats.placed, icon: CheckCircle, color: "text-green-400" },
          { label: "Apps This Week", value: stats.appsThisWeek, icon: Briefcase, color: "text-purple-400" },
          { label: "Reply Rate", value: `${stats.replyRate}%`, icon: Clock, color: "text-yellow-400" },
          { label: "Pending Msgs", value: stats.pendingMessages, icon: MessageSquare, color: "text-red-400" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-display font-semibold mb-6">Candidate Pipeline</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusPipeline}>
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1B2D4F', borderColor: 'rgba(255,255,255,0.08)' }} />
                <Bar dataKey="count" fill="#0099E6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-display font-semibold mb-6">Applications (Last 14 Days)</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={appsPerDay}>
                <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1B2D4F', borderColor: 'rgba(255,255,255,0.08)' }} />
                <Line type="monotone" dataKey="apps" stroke="#00C896" strokeWidth={2} dot={{ r: 4, fill: '#00C896' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
          <h2 className="text-lg font-display font-semibold">Recent Applications</h2>
          <Link href="/applications" className="text-sm text-primary hover:underline font-medium">View All</Link>
        </div>
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
                <td className="px-4 py-3"><Link href={`/candidates/${app.candidate_id}`} className="font-medium text-secondary hover:underline">{app.candidate_name}</Link></td>
                <td className="px-4 py-3 font-medium">{app.company}</td>
                <td className="px-4 py-3">{app.job_title}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border capitalize">
                    {app.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="w-24 h-2 rounded-full bg-background overflow-hidden">
                    <div 
                      className={`h-full ${app.quality_score >= 80 ? 'bg-primary' : app.quality_score >= 60 ? 'bg-yellow-400' : 'bg-destructive'}`} 
                      style={{ width: `${app.quality_score}%` }} 
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(app.applied_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
