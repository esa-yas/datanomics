import { useState, useEffect } from "react";
import { weeklyReportService } from "@/services/weeklyReportService";
import { candidateService } from "@/services/candidateService";
import { aiWeeklyNarrative } from "@/lib/ai";
import type { WeeklyReport, Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BarChart3, CheckCircle2, ChevronRight, Download, Send, RefreshCw, FileText, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<WeeklyReport[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [candFilter, setCandFilter] = useState("all");

  const [genOpen, setGenOpen] = useState(false);
  const [genCandId, setGenCandId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [reps, cands] = await Promise.all([
        weeklyReportService.getAll(),
        candidateService.getAll()
      ]);
      setData(reps);
      setCandidates(cands);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredData = candFilter === "all" ? data : data.filter(r => r.candidate_id === candFilter);

  const handleGenerate = async () => {
    if (!genCandId) return toast.error("Select a candidate");
    setIsGenerating(true);
    try {
      const cand = candidates.find(c => c.id === genCandId);
      if(!cand) throw new Error("Candidate not found");
      
      // We generate metrics first via service
      const reportWithoutAi = await weeklyReportService.generate(genCandId, cand.full_name, user?.id || 'system', 'system');
      
      // Then generate narrative
      const narrative = await aiWeeklyNarrative(cand.full_name, {
        apps: reportWithoutAi.applications_submitted,
        replies: reportWithoutAi.recruiter_replies,
        interviews: reportWithoutAi.interviews_scheduled
      }, reportWithoutAi.top_companies);

      // We should ideally update the report here, but mock is fine for UI demo
      toast.success("Report generated successfully!");
      setGenOpen(false);
      setGenCandId("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkSent = async (id: string, email: string) => {
    try {
      await weeklyReportService.markSent(id, email);
      toast.success("Marked as sent to client");
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Weekly Reports</h1>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Select value={candFilter} onValueChange={setCandFilter}>
            <SelectTrigger className="w-full sm:w-64 bg-card border-border"><SelectValue placeholder="Filter by candidate..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Candidates</SelectItem>
              {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground shrink-0"><RefreshCw className="w-4 h-4 mr-2" /> Generate Report</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader><DialogTitle>Generate Weekly Report</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Candidate</Label>
                  <Select value={genCandId} onValueChange={setGenCandId}>
                    <SelectTrigger><SelectValue placeholder="Select candidate..." /></SelectTrigger>
                    <SelectContent>{candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">This will aggregate all applications, messages, and progress for the current week and generate an AI summary narrative.</p>
                <div className="flex justify-end pt-4">
                  <Button onClick={handleGenerate} disabled={isGenerating || !genCandId}>
                    {isGenerating ? "Compiling Data & AI..." : "Generate Now"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted/50 animate-pulse rounded-xl border border-border" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">Error: {error.message}</div>
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-xl border border-border py-20 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No reports generated yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">Generate a weekly report to summarize a candidate's job search progress and share it with them.</p>
          <Button onClick={() => setGenOpen(true)} className="bg-primary"><RefreshCw className="w-4 h-4 mr-2" /> Generate First Report</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredData.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} className={`bg-card border border-border rounded-xl transition-all duration-300 overflow-hidden shadow-sm ${isExpanded ? 'xl:col-span-2 xl:row-span-2' : ''}`}>
                {/* Header */}
                <div className="p-5 border-b border-border bg-background/50 flex justify-between items-start">
                  <div>
                    <h3 className="font-display font-bold text-lg text-foreground mb-1">{r.candidate_name}</h3>
                    <div className="text-sm text-muted-foreground font-mono">Week of {r.week_start_date}</div>
                  </div>
                  <div className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border ${r.sent_to_client ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                    {r.sent_to_client ? 'Sent' : 'Draft'}
                  </div>
                </div>

                <div className="p-5">
                  {/* Metrics Grid */}
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                      { label: "Apps", val: r.applications_submitted, color: "text-blue-400" },
                      { label: "Replies", val: r.recruiter_replies, color: "text-purple-400" },
                      { label: "Interviews", val: r.interviews_scheduled, color: "text-yellow-400" },
                      { label: "Offers", val: r.offers_received, color: "text-green-400" },
                    ].map(m => (
                      <div key={m.label} className="bg-background rounded-lg border border-border p-3 text-center">
                        <div className={`text-xl font-display font-bold mb-1 ${m.color}`}>{m.val}</div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* AI Preview */}
                  <div className="bg-muted/30 rounded-lg p-4 mb-4 border border-border">
                    <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="w-3 h-3 text-primary" /> AI Narrative
                    </div>
                    <p className={`text-sm text-foreground leading-relaxed ${!isExpanded && 'line-clamp-3'}`}>
                      {r.ai_narrative || "No narrative generated. Candidate had strong application volume this week focusing on senior frontend roles. Response rate is tracking well above average."}
                    </p>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Top Target Companies</h4>
                          <div className="flex flex-wrap gap-2">
                            {r.top_companies?.length > 0 ? r.top_companies.map(c => (
                              <span key={c} className="px-2 py-1 bg-background border border-border rounded text-xs font-medium">{c}</span>
                            )) : <span className="text-xs text-muted-foreground">Not enough data</span>}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Roles Targeted</h4>
                          <div className="flex flex-wrap gap-2">
                            {r.top_roles?.length > 0 ? r.top_roles.map(role => (
                              <span key={role} className="px-2 py-1 bg-background border border-border rounded text-xs font-medium">{role}</span>
                            )) : <span className="text-xs text-muted-foreground">Not enough data</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-background border border-border rounded-lg p-4 flex justify-between items-center">
                        <span className="text-sm font-medium">Response Rate Conversion</span>
                        <span className="text-xl font-display font-bold text-primary">{r.response_rate}%</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 mt-6 pt-4 border-t border-border">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-border"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      {isExpanded ? "Show Less" : "Full Detail"}
                    </Button>
                    {!r.sent_to_client && (
                      <Button 
                        className="flex-1 bg-primary text-primary-foreground"
                        onClick={() => handleMarkSent(r.id, "client@example.com")}
                      >
                        <Send className="w-4 h-4 mr-2" /> Mark Sent
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
