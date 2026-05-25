import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { friendlyError } from "@/lib/dbError";
import { candidateService } from "@/services/candidateService";
import { applicationService } from "@/services/applicationService";
import { resumeService } from "@/services/resumeService";
import { callAI, aiTailorResume } from "@/lib/ai";
import type { Candidate, Application, Resume, CandidateNote, FollowUp } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import toast from "react-hot-toast";
import { ArrowRight, Download, FileText, Target, MapPin, DollarSign, ExternalLink, Calendar, CheckCircle2, Briefcase, Mail, Plus, User } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  active_search: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  interview_stage: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  offer_received: "bg-green-500/20 text-green-300 border-green-500/30",
  placed: "bg-green-600/20 text-green-400 border-green-600/30",
  paused: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  dropped: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Sub-data state
  const [apps, setApps] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  const loadAll = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cand, a, r, n, f] = await Promise.all([
        candidateService.getById(id),
        applicationService.getByCandidate(id),
        resumeService.getByCandidate(id),
        candidateService.getNotes(id),
        candidateService.getFollowUps(id)
      ]);
      setData(cand);
      setApps(a);
      setResumes(r);
      setNotes(n);
      setFollowUps(f);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;
    try {
      const updated = await candidateService.update(data.id, { status: newStatus as any });
      setData(updated);
      toast.success("Status updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const timeAgo = (d: string) => { 
    const diff = Date.now() - new Date(d).getTime(); 
    if (diff < 60000) return 'just now'; 
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago'; 
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago'; 
    return Math.floor(diff/86400000) + 'd ago'; 
  };

  if (loading) {
    return <div className="p-6 space-y-4">
      <div className="h-8 w-64 bg-muted animate-pulse rounded" />
      <div className="h-32 bg-card border border-border animate-pulse rounded-lg" />
      <div className="grid grid-cols-4 gap-4"><div className="h-24 bg-card border border-border rounded-lg animate-pulse" /><div className="h-24 bg-card border border-border rounded-lg animate-pulse" /><div className="h-24 bg-card border border-border rounded-lg animate-pulse" /><div className="h-24 bg-card border border-border rounded-lg animate-pulse" /></div>
      <div className="h-64 bg-card border border-border animate-pulse rounded-lg" />
    </div>;
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 font-medium">
          Error loading candidate: {error?.message || "Not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/candidates" className="hover:text-foreground hover:underline transition-colors">Candidates</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{data.full_name}</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold font-display shrink-0 border border-primary/20">
              {data.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-2">{data.full_name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={data.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className={`h-7 w-auto px-2 py-0 text-xs font-semibold tracking-wide uppercase border-0 rounded-md focus:ring-0 ${STATUS_COLORS[data.status]}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(STATUS_COLORS).map(s => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                  {data.work_auth}
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border text-foreground">
                  {data.experience_years} YOE
                </span>
                {data.target_roles.map(r => (
                  <span key={r} className="inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold bg-muted/50 border border-border text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-border hover:bg-muted"><Mail className="w-4 h-4 mr-2" /> Email</Button>
            {data.linkedin_url && (
              <Button variant="outline" className="border-border hover:bg-muted" onClick={() => window.open(data.linkedin_url, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" /> LinkedIn
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Applications", value: apps.length, color: "text-blue-400" },
          { label: "Replies", value: apps.filter(a => ['recruiter_replied','phone_screen','interview_scheduled','interview_done','final_round','offer'].includes(a.status)).length, color: "text-purple-400" },
          { label: "Interviews", value: apps.filter(a => ['interview_scheduled','interview_done','final_round'].includes(a.status)).length, color: "text-yellow-400" },
          { label: "Offers", value: apps.filter(a => a.status === 'offer').length, color: "text-green-400" },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-gradient-to-br from-transparent to-muted opacity-50 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">{stat.label}</span>
            <div className={`text-3xl font-display font-extrabold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto no-scrollbar">
          {['overview', 'applications', 'resumes', 'notes', 'follow_ups'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-6 py-4 text-sm font-medium tracking-wide transition-colors whitespace-nowrap ${
                activeTab === t 
                  ? "text-primary border-b-2 border-primary bg-primary/5" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.replace('_', ' ').charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>
        
        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab data={data} />}
          {activeTab === 'applications' && <ApplicationsTab data={data} apps={apps} />}
          {activeTab === 'resumes' && <ResumesTab data={data} resumes={resumes} onTailored={loadAll} />}
          {activeTab === 'notes' && <NotesTab data={data} notes={notes} onNoteAdded={loadAll} timeAgo={timeAgo} />}
          {activeTab === 'follow_ups' && <FollowUpsTab data={data} followUps={followUps} onUpdate={loadAll} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: Candidate }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Contact Info</h3>
          <div className="bg-background rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{data.email}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{data.phone || '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Location</span>
              <span className="font-medium">{[data.city, data.state, data.country].filter(Boolean).join(', ')}</span>
            </div>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><Target className="w-4 h-4" /> Work Preferences</h3>
          <div className="bg-background rounded-lg border border-border p-4 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">Work Modes</div>
              <div className="flex gap-2">
                {data.preferred_work_modes?.map(m => (
                  <span key={m} className="px-2 py-1 bg-muted rounded text-xs font-medium capitalize">{m}</span>
                )) || <span className="text-sm text-muted-foreground">Not specified</span>}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
              <span className="text-muted-foreground">Relocation</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${data.willing_to_relocate ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                {data.willing_to_relocate ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><FileText className="w-4 h-4" /> Skills</h3>
          <div className="flex flex-wrap gap-2">
            {data.skills?.map(s => (
              <span key={s} className="px-3 py-1.5 bg-background border border-border rounded-md text-sm font-medium">
                {s}
              </span>
            )) || <span className="text-sm text-muted-foreground">No skills listed</span>}
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Salary Target</h3>
          <div className="bg-background rounded-lg border border-border p-4">
            {data.min_rate ? (
              <div className="text-2xl font-bold text-foreground">
                ${data.min_rate.toLocaleString()} <span className="text-sm font-normal text-muted-foreground uppercase">/{data.rate_type === 'hourly' ? 'hr' : 'yr'}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Not specified</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationsTab({ data, apps }: { data: Candidate, apps: Application[] }) {
  if (apps.length === 0) {
    return (
      <div className="text-center py-12">
        <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">No applications yet</h3>
        <Button variant="outline" className="mt-2">Log First Application</Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-muted-foreground border-b border-border">
          <tr>
            <th className="px-4 py-3 font-medium">Company & Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Quality</th>
            <th className="px-4 py-3 font-medium text-right">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {apps.map(a => (
            <tr key={a.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{a.company}</div>
                <div className="text-xs text-muted-foreground">{a.job_title}</div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-muted border border-border">
                  {a.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-4 py-3 w-48">
                <div className="flex items-center gap-2">
                  <Progress value={a.quality_score} className="h-2 flex-1" />
                  <span className="text-xs font-medium w-8 text-right">{a.quality_score}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                {new Date(a.applied_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumesTab({ data, resumes, onTailored }: { data: Candidate, resumes: Resume[], onTailored: () => void }) {
  const [jd, setJd] = useState("");
  const [isTailoring, setIsTailoring] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const baseResume = resumes.find(r => r.type === 'base');

  const handleTailor = async () => {
    if (!jd.trim()) { toast.error("Paste a job description first"); return; }
    if (!baseResume?.raw_text && !baseResume?.summary) { toast.error("Candidate has no base resume content to tailor"); return; }
    
    setIsTailoring(true);
    try {
      const res = await aiTailorResume(baseResume.raw_text || baseResume.summary, jd, data.full_name);
      setResult(res);
      toast.success("Analysis complete");
    } catch (err: any) {
      toast.error(err.message || "Tailoring failed");
    } finally {
      setIsTailoring(false);
    }
  };

  const saveTailored = async () => {
    if (!result) return;
    try {
      await resumeService.create({
        candidate_id: data.id,
        version_name: `${result.suggestedTitle || 'Tailored'} Resume`,
        version_number: resumes.length + 1,
        type: 'tailored',
        job_title: result.suggestedTitle || data.target_roles[0] || 'Role',
        summary: result.optimizedSummary || "",
        skills: result.optimizedSkills || [],
        experience: [],
        added_keywords: result.addedKeywords || [],
        match_score_before: result.matchScoreBefore,
        match_score_after: result.matchScoreAfter,
        is_active: false,
        created_by: 'system'
      });
      toast.success("Tailored resume saved");
      setDialogOpen(false);
      onTailored();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground">AI Tailor Resume</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tailor Resume with AI</DialogTitle>
            </DialogHeader>
            {!result ? (
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Job Description</Label>
                  <Textarea 
                    placeholder="Paste the full job description here..." 
                    className="h-64 font-mono text-xs"
                    value={jd}
                    onChange={e => setJd(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleTailor} disabled={isTailoring} className="w-full">
                    {isTailoring ? "Analyzing..." : "Analyze & Tailor"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pt-4">
                <div className="flex justify-around items-center p-6 bg-background rounded-lg border border-border">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground uppercase font-bold mb-1">Before</div>
                    <div className="text-4xl font-display font-bold text-destructive">{result.matchScoreBefore}%</div>
                  </div>
                  <ArrowRight className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground uppercase font-bold mb-1">After</div>
                    <div className="text-4xl font-display font-bold text-primary">{result.matchScoreAfter}%</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold text-sm mb-2">Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.missingKeywords?.map((k: string) => (
                      <span key={`miss-${k}`} className="px-2 py-1 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20 line-through opacity-70">{k}</span>
                    ))}
                    {result.addedKeywords?.map((k: string) => (
                      <span key={`add-${k}`} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded border border-primary/20 flex items-center gap-1"><Plus className="w-3 h-3"/> {k}</span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold text-sm mb-2">Optimized Summary</h4>
                  <div className="p-3 bg-muted rounded-md text-sm italic border-l-4 border-primary">
                    {result.optimizedSummary}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setResult(null)}>Reset</Button>
                  <Button onClick={saveTailored} className="bg-primary text-primary-foreground">Save as New Version</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {resumes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No resumes found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map(r => (
            <div key={r.id} className="bg-background border border-border rounded-lg p-5 flex flex-col hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="font-semibold text-foreground truncate pr-2">{r.version_name}</div>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  r.type === 'base' ? 'bg-teal-500/20 text-teal-300' :
                  r.type === 'tailored' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {r.type}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-4">v{r.version_number} • {r.job_title}</div>
              
              {r.type === 'tailored' && r.match_score_after && (
                <div className="mb-4 flex items-center gap-2 bg-muted/50 p-2 rounded-md border border-border text-xs">
                  <span className="text-muted-foreground">Score:</span>
                  <span className="line-through opacity-60">{r.match_score_before}%</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="font-bold text-primary">{r.match_score_after}%</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mb-4 flex-1">
                {r.skills?.slice(0, 5).map(s => (
                  <span key={s} className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground border border-border">{s}</span>
                ))}
                {(r.skills?.length || 0) > 5 && <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">+{r.skills.length - 5}</span>}
              </div>

              <div className="flex gap-2 pt-3 border-t border-border mt-auto">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" disabled={!r.pdf_file_url}>
                  <Download className="w-3 h-3 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" disabled={!r.docx_file_url}>
                  <Download className="w-3 h-3 mr-1" /> DOCX
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTab({ data, notes, onNoteAdded, timeAgo }: { data: Candidate, notes: CandidateNote[], onNoteAdded: () => void, timeAgo: (d: string) => string }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await candidateService.addNote(data.id, content, 'system', 'System User'); // Simplified auth for task
      setContent("");
      onNoteAdded();
      toast.success("Note added");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-muted/30 p-4 rounded-lg border border-border">
        <Textarea 
          placeholder="Add a new note..." 
          className="mb-3 bg-background border-border min-h-[100px]"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={submitting || !content.trim()}>Add Note</Button>
        </div>
      </div>

      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No notes yet.</div>
        ) : (
          notes.map(n => (
            <div key={n.id} className="bg-background border border-border p-4 rounded-lg flex gap-4">
              <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-xs shrink-0">
                {n.author_name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-1">
                  <div className="font-semibold text-sm">{n.author_name}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{n.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FollowUpsTab({ data, followUps, onUpdate }: { data: Candidate, followUps: FollowUp[], onUpdate: () => void }) {
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !date) return;
    setSubmitting(true);
    try {
      await candidateService.addFollowUp({
        candidate_id: data.id,
        description: desc,
        due_date: date,
        assigned_to: 'system',
        completed: false
      });
      setDesc("");
      setDate("");
      onUpdate();
      toast.success("Follow-up scheduled");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComplete = async (id: string, current: boolean) => {
    if (current) return;
    try {
      await candidateService.completeFollowUp(id);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-4">
        {followUps.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
            No follow-ups scheduled.
          </div>
        ) : (
          followUps.map(f => {
            const isOverdue = !f.completed && new Date(f.due_date) < new Date() && new Date(f.due_date).toDateString() !== new Date().toDateString();
            return (
              <div key={f.id} className={`p-4 rounded-lg border flex items-start gap-4 transition-colors ${f.completed ? 'bg-muted/30 border-border/50 opacity-60' : isOverdue ? 'bg-destructive/5 border-destructive/30' : 'bg-background border-border hover:border-primary/50'}`}>
                <Checkbox 
                  checked={f.completed} 
                  onCheckedChange={() => toggleComplete(f.id, f.completed)} 
                  disabled={f.completed}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${f.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {f.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className={isOverdue ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                      Due: {new Date(f.due_date).toLocaleDateString()}
                    </span>
                    {f.completed && <span className="text-green-500 font-medium ml-2">Completed</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="bg-muted/20 p-5 rounded-lg border border-border h-fit">
        <h3 className="font-semibold mb-4">Schedule Follow-up</h3>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={desc} 
              onChange={e => setDesc(e.target.value)} 
              placeholder="Check in on interview status..."
              required
              className="bg-background min-h-[100px]"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>Add Follow-up</Button>
        </form>
      </div>
    </div>
  );
}
