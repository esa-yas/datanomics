import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/dbError";
import { resumeService } from "@/services/resumeService";
import { candidateService } from "@/services/candidateService";
import { callAI, aiTailorResume } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, ArrowRight, Sparkles, Plus } from "lucide-react";
import toast from "react-hot-toast";

export default function ResumesPage() {
  const [data, setData] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [candidateFilter, setCandidateFilter] = useState("all");

  // Tailor State
  const [tailorOpen, setTailorOpen] = useState(false);
  const [selectedCand, setSelectedCand] = useState("");
  const [jd, setJd] = useState("");
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<any>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        supabase.from('resumes').select('*, candidates(full_name)').order('created_at', { ascending: false }),
        candidateService.getAll()
      ]);
      if (rRes.error) throw rRes.error;
      setData(rRes.data || []);
      setCandidates(cRes);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredData = candidateFilter === "all" ? data : data.filter(r => r.candidate_id === candidateFilter);

  const handleTailor = async () => {
    if (!selectedCand) return toast.error("Select a candidate");
    if (!jd.trim()) return toast.error("Paste a job description");

    const candData = candidates.find(c => c.id === selectedCand);
    const cResumes = data.filter(r => r.candidate_id === selectedCand);
    const base = cResumes.find(r => r.type === 'base') || cResumes[0];

    if (!base?.raw_text && !base?.summary) return toast.error("Candidate has no resume text to tailor");

    setIsTailoring(true);
    try {
      const res = await aiTailorResume(base.raw_text || base.summary, jd, candData?.full_name || "Candidate");
      setTailorResult(res);
      toast.success("Resume tailored successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to tailor resume");
    } finally {
      setIsTailoring(false);
    }
  };

  const handleSaveTailored = async () => {
    if (!selectedCand || !tailorResult) return;
    try {
      const cResumes = data.filter(r => r.candidate_id === selectedCand);
      await resumeService.create({
        candidate_id: selectedCand,
        version_name: `${tailorResult.suggestedTitle || 'Tailored'} - New`,
        version_number: cResumes.length + 1,
        type: 'tailored',
        job_title: tailorResult.suggestedTitle || 'Target Role',
        summary: tailorResult.optimizedSummary || "",
        skills: tailorResult.optimizedSkills || [],
        experience: [], // Simplification for UI
        added_keywords: tailorResult.addedKeywords || [],
        match_score_before: tailorResult.matchScoreBefore,
        match_score_after: tailorResult.matchScoreAfter,
        is_active: false,
        created_by: 'system'
      });
      toast.success("Saved tailored resume");
      setTailorOpen(false);
      setTailorResult(null);
      setJd("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Resume Database</h1>
        <div className="flex items-center gap-4">
          <div className="w-64">
            <Select value={candidateFilter} onValueChange={setCandidateFilter}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Filter by candidate..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Candidates</SelectItem>
                {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <Dialog open={tailorOpen} onOpenChange={(open) => { setTailorOpen(open); if(!open) setTailorResult(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground">
                <Sparkles className="w-4 h-4 mr-2" /> AI Tailor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tailor Resume with AI</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {!tailorResult ? (
                  <>
                    <div className="space-y-2">
                      <Label>Candidate</Label>
                      <Select value={selectedCand} onValueChange={setSelectedCand}>
                        <SelectTrigger><SelectValue placeholder="Select candidate..." /></SelectTrigger>
                        <SelectContent>
                          {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Job Description</Label>
                      <Textarea 
                        placeholder="Paste the full JD..." 
                        className="min-h-[200px] font-mono text-xs bg-background"
                        value={jd}
                        onChange={e => setJd(e.target.value)}
                      />
                    </div>
                    <Button className="w-full" onClick={handleTailor} disabled={isTailoring}>
                      {isTailoring ? "Analyzing..." : "Analyze & Tailor"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex justify-around items-center p-6 bg-background rounded-lg border border-border">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground uppercase font-bold mb-1">Match Before</div>
                        <div className="text-4xl font-display font-bold text-destructive">{tailorResult.matchScoreBefore}%</div>
                      </div>
                      <ArrowRight className="w-8 h-8 text-muted-foreground" />
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground uppercase font-bold mb-1">Match After</div>
                        <div className="text-4xl font-display font-bold text-primary">{tailorResult.matchScoreAfter}%</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-destructive">Missing Keywords Identified</h4>
                        <div className="flex flex-wrap gap-1">
                          {tailorResult.missingKeywords?.map((k: string) => (
                            <span key={k} className="px-2 py-0.5 bg-destructive/10 text-destructive text-[10px] rounded border border-destructive/20">{k}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-primary">Added to Resume</h4>
                        <div className="flex flex-wrap gap-1">
                          {tailorResult.addedKeywords?.map((k: string) => (
                            <span key={k} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded border border-primary/20">{k}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm mb-2">Optimized Summary</h4>
                      <div className="p-3 bg-muted rounded-md text-sm italic border-l-4 border-primary text-foreground">
                        {tailorResult.optimizedSummary}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setTailorResult(null)}>Edit Prompt</Button>
                      <Button onClick={handleSaveTailored} className="bg-primary text-primary-foreground">Save Tailored Version</Button>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 bg-muted/50 animate-pulse rounded-xl border border-border" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error: {friendlyError(error)}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-xl border border-border py-16 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No resumes found</h3>
          <p className="text-muted-foreground text-sm">Upload a base resume from a candidate profile to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredData.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5 card-hover flex flex-col group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-foreground text-lg leading-tight truncate pr-2 max-w-[180px]" title={r.candidates?.full_name}>
                    {r.candidates?.full_name || 'Unknown'}
                  </h3>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.version_name}</div>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider shrink-0 ${
                  r.type === 'base' ? 'bg-teal-500/20 text-teal-400' :
                  r.type === 'tailored' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {r.type}
                </span>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded border border-border">v{r.version_number}</span>
                <span className="text-xs text-muted-foreground truncate">{r.job_title}</span>
              </div>

              {r.type === 'tailored' && r.match_score_after && (
                <div className="mb-4 bg-background/50 rounded-md border border-border p-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase font-bold text-[10px]">ATS Match</span>
                  <div className="flex items-center gap-1.5">
                    <span className="line-through text-muted-foreground">{r.match_score_before}%</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <span className="font-bold text-primary">{r.match_score_after}%</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mb-4 flex-1 items-start content-start">
                {r.skills?.slice(0, 4).map((s: string) => (
                  <span key={s} className="px-1.5 py-0.5 bg-background rounded text-[10px] text-muted-foreground border border-border">{s}</span>
                ))}
                {(r.skills?.length || 0) > 4 && <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">+{r.skills.length - 4}</span>}
              </div>

              <div className="flex gap-2 pt-4 border-t border-border mt-auto opacity-70 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border" disabled={!r.pdf_file_url}>
                  <Download className="w-3 h-3 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border" disabled={!r.docx_file_url}>
                  <Download className="w-3 h-3 mr-1.5" /> DOCX
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
