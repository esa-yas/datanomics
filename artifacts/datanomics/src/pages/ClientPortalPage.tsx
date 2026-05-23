import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { applicationService } from "@/services/applicationService";
import { weeklyReportService } from "@/services/weeklyReportService";
import { supabase } from "@/lib/supabase";
import type { Application, WeeklyReport } from "@/types";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Briefcase, ChevronRight, Activity, ArrowRight, FileText } from "lucide-react";
import { Link } from "wouter";

export default function ClientPortalPage() {
  const { user, signOut } = useAuthStore();
  const [apps, setApps] = useState<Application[]>([]);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      
      try {
        // Need to find the candidate record for this user to fetch apps and reports
        const { data: cand } = await supabase.from('candidates').select('id').eq('email', user.email).single();
        
        if (cand) {
          const [a, r] = await Promise.all([
            applicationService.getByCandidate(cand.id),
            weeklyReportService.getByCandidate(cand.id)
          ]);
          setApps(a);
          setReports(r.filter(rep => rep.sent_to_client)); // Only show sent reports
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, [user]);

  const activeApps = apps.filter(a => !['rejected', 'ghosted', 'withdrawn'].includes(a.status));
  const interviews = apps.filter(a => ['interview_scheduled', 'interview_done', 'final_round'].includes(a.status));
  const offers = apps.filter(a => a.status === 'offer');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-body">
      {/* Top Nav */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-display font-bold">
              D
            </div>
            <span className="font-display font-bold text-lg tracking-tight">DATANOMICS</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">Welcome back, <span className="font-medium text-foreground">{user?.display_name}</span></span>
            <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10 pb-20">
        
        {/* Welcome Hero */}
        <section>
          <h1 className="text-4xl font-display font-bold text-foreground mb-3 tracking-tight">Your Job Search OS</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">We're actively managing your search. Here is a real-time overview of your pipeline and weekly performance.</p>
        </section>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-card border border-border rounded-2xl" />)}
          </div>
        ) : (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Applications", value: apps.length, color: "text-blue-400" },
              { label: "Active Pipeline", value: activeApps.length, color: "text-teal-400" },
              { label: "Interviews", value: interviews.length, color: "text-yellow-400" },
              { label: "Offers", value: offers.length, color: "text-green-400" },
            ].map((stat, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-transparent to-muted opacity-50 rounded-full" />
                <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{stat.label}</div>
                <div className={`text-5xl font-display font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </section>
        )}

        {/* Pipeline Visual */}
        <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Active Pipeline Status
          </h2>
          <div className="relative pt-4 pb-2">
            <div className="absolute top-1/2 left-0 w-full h-1.5 bg-muted -translate-y-1/2 rounded-full z-0" />
            <div className="relative z-10 flex justify-between">
              {[
                { label: "Applied", val: apps.filter(a => ['applied', 'viewed'].includes(a.status)).length, active: true },
                { label: "Screening", val: apps.filter(a => ['recruiter_replied', 'phone_screen'].includes(a.status)).length, active: true },
                { label: "Interview", val: interviews.length, active: interviews.length > 0 },
                { label: "Offer", val: offers.length, active: offers.length > 0 },
              ].map((step, i) => (
                <div key={i} className="flex flex-col items-center group">
                  <div className={`w-8 h-8 rounded-full border-4 mb-3 flex items-center justify-center font-bold text-xs bg-background transition-colors ${step.active ? 'border-primary text-primary shadow-[0_0_15px_rgba(0,200,150,0.3)]' : 'border-muted text-muted-foreground'}`}>
                    {step.val}
                  </div>
                  <div className={`text-xs font-bold uppercase tracking-wider ${step.active ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Weekly Reports */}
        <section>
          <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Weekly Executive Summaries
          </h2>
          {loading ? (
            <div className="space-y-4"><div className="h-40 bg-card border border-border rounded-2xl animate-pulse" /></div>
          ) : reports.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 opacity-20 mx-auto mb-3" />
              <p>Your first weekly report will appear here soon.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((r, i) => (
                <div key={r.id} className={`bg-card border ${i === 0 ? 'border-primary/30 shadow-[0_0_20px_rgba(0,200,150,0.05)]' : 'border-border'} rounded-2xl p-6 transition-all`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Week of {new Date(r.week_start_date).toLocaleDateString(undefined, {month: 'long', day: 'numeric'})}</h3>
                      {i === 0 && <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">Latest</span>}
                    </div>
                    <div className="flex gap-4 text-sm font-medium">
                      <div className="text-center px-4 py-2 bg-background border border-border rounded-lg"><div className="text-xl font-bold text-blue-400">{r.applications_submitted}</div><div className="text-[10px] uppercase text-muted-foreground">Apps</div></div>
                      <div className="text-center px-4 py-2 bg-background border border-border rounded-lg"><div className="text-xl font-bold text-yellow-400">{r.interviews_scheduled}</div><div className="text-[10px] uppercase text-muted-foreground">Interviews</div></div>
                    </div>
                  </div>
                  <div className="bg-background/50 border border-border rounded-xl p-4 text-sm leading-relaxed text-foreground">
                    <span className="font-bold text-muted-foreground uppercase text-xs tracking-wider block mb-2">Narrative</span>
                    {r.ai_narrative || "Weekly progress was steady. Maintained high application volume targeting senior roles."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
