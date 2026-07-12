import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { friendlyError } from "@/lib/dbError";
import { candidateService } from "@/services/candidateService";
import { applicationService } from "@/services/applicationService";
import { resumeService } from "@/services/resumeService";
import { callAI, aiTailorResume } from "@/lib/ai";
import { buildTailoredText } from "@/lib/utils/resumeTailor";
import type { Candidate, Application, Resume, CandidateNote } from "@/types";
import { gmailSyncService, type GmailApplyMessage, type GmailSyncLog, type InterviewStats } from "@/services/gmailSyncService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import toast from "react-hot-toast";
import { ArrowRight, Download, FileText, Target, DollarSign, ExternalLink, CheckCircle2, Briefcase, Plus, User, AlertCircle, Loader2, Mail, Link2 } from "lucide-react";
import { GoogleGmailSyncCard } from "@/components/candidate/GoogleGmailSyncCard";
import { JobResearchCard } from "@/components/candidate/JobResearchCard";
import { InterviewPracticeCard } from "@/components/candidate/InterviewPracticeCard";
import { CandidateAssignmentCard } from "@/components/candidate/CandidateAssignmentCard";
import { ImportedProfileView } from "@/components/profiles/ImportedProfileView";
import { importedProfileService } from "@/services/importedProfileService";
import type { ImportedProfile } from "@/lib/profiles/importedProfiles";
import { useAuthStore } from "@/stores/authStore";
import { canConnectGmail, canManageCandidateAssignments } from "@/lib/permissions";

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
  const { user } = useAuthStore();
  const allowGmailConnect = canConnectGmail(user?.role);
  const allowAssignmentEdit = canManageCandidateAssignments(user?.role);
  const [data, setData] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Sub-data state
  const [apps, setApps] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [gmailApplies, setGmailApplies] = useState<GmailApplyMessage[]>([]);
  const [syncLogs, setSyncLogs] = useState<GmailSyncLog[]>([]);
  const [interviewStats, setInterviewStats] = useState<InterviewStats | null>(null);
  const [importedProfile, setImportedProfile] = useState<ImportedProfile | null>(null);

  const loadAll = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cand, a, r, n, gmail, logs, interviews] = await Promise.all([
        candidateService.getById(id),
        applicationService.getByCandidate(id),
        resumeService.getByCandidate(id),
        candidateService.getNotes(id),
        gmailSyncService.listApplyMessages({ candidateId: id, limit: 500 }),
        gmailSyncService.getAllSyncLogs(id),
        gmailSyncService.getInterviewStats(id).catch(() => ({ total: 0, last7Days: 0, recent: [] })),
      ]);
      setData(cand);
      setApps(a);
      setResumes(r);
      setNotes(n);
      setGmailApplies(gmail);
      setSyncLogs(logs);
      setInterviewStats(interviews);

      // Link the imported intake profile by matching email (best-effort).
      if (cand.email) {
        importedProfileService
          .getByEmail(cand.email)
          .then(setImportedProfile)
          .catch(() => setImportedProfile(null));
      } else {
        setImportedProfile(null);
      }
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
      const updates: { status: typeof data.status; job_research_enabled?: boolean } = {
        status: newStatus as typeof data.status,
      };
      if (newStatus === 'placed') {
        updates.job_research_enabled = false;
      }
      const updated = await candidateService.update(data.id, updates);
      setData(updated);
      toast.success(
        newStatus === 'placed' ? 'Status updated — AI job search paused' : 'Status updated',
      );
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
          { label: "Applications", value: gmailApplies.length || apps.length, color: "text-blue-400" },
          { label: "Replies", value: apps.filter(a => ['recruiter_replied','phone_screen','interview_scheduled','interview_done','final_round','offer'].includes(a.status)).length, color: "text-purple-400" },
          {
            label: "Interviews",
            value: interviewStats?.total ?? 0,
            sub: interviewStats ? `${interviewStats.last7Days} last 7 days` : undefined,
            color: "text-yellow-400",
          },
          { label: "Offers", value: apps.filter(a => a.status === 'offer').length, color: "text-green-400" },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-gradient-to-br from-transparent to-muted opacity-50 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">{stat.label}</span>
            <div className={`text-3xl font-display font-extrabold ${stat.color}`}>{stat.value}</div>
            {'sub' in stat && stat.sub && (
              <div className="text-xs text-muted-foreground mt-1">{stat.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto no-scrollbar">
          {['overview', 'job_research', 'interview_practice', 'applications', 'resumes', 'notes', ...(importedProfile ? ['intake'] : [])].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-6 py-4 text-sm font-medium tracking-wide transition-colors whitespace-nowrap ${
                activeTab === t 
                  ? "text-primary border-b-2 border-primary bg-primary/5" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t === 'job_research'
                ? 'Job research'
                : t === 'interview_practice'
                  ? 'Interview practice'
                  : t.replace('_', ' ').charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>
        
        <div className="p-6">
          {activeTab === 'overview' && (
            <>
              {allowAssignmentEdit && (
                <div className="mb-6">
                  <CandidateAssignmentCard candidate={data} onUpdated={setData} />
                </div>
              )}
              <OverviewTab data={data} readOnlyGmail={!allowGmailConnect} interviewStats={interviewStats} />
            </>
          )}
          {activeTab === 'job_research' && (
            <JobResearchTab
              data={data}
              onAutoToggle={(enabled) => setData((d) => (d ? { ...d, job_research_enabled: enabled } : d))}
            />
          )}
          {activeTab === 'interview_practice' && (
            <InterviewPracticeCard
              candidateId={data.id}
              candidateName={data.full_name}
              resumes={resumes}
            />
          )}
          {activeTab === 'applications' && (
            <ApplicationsTab apps={apps} gmailApplies={gmailApplies} syncLogs={syncLogs} />
          )}
          {activeTab === 'resumes' && <ResumesTab data={data} resumes={resumes} onTailored={loadAll} />}
          {activeTab === 'notes' && <NotesTab data={data} notes={notes} onNoteAdded={loadAll} timeAgo={timeAgo} />}
          {activeTab === 'intake' && importedProfile && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-foreground/90">
                <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  Linked to an imported intake profile by matching email. This is the candidate&apos;s
                  original submission — resumes are tailored separately in the Resumes tab.
                </span>
              </div>
              <ImportedProfileView profile={importedProfile} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobResearchTab({
  data,
  onAutoToggle,
}: {
  data: Candidate;
  onAutoToggle: (enabled: boolean) => void;
}) {
  return (
    <JobResearchCard
      candidateId={data.id}
      candidateName={data.full_name}
      targetRoles={data.target_roles ?? []}
      candidateStatus={data.status}
      autoEnabled={data.job_research_enabled ?? true}
      lastResearchAt={data.last_job_research_at}
      onAutoToggle={onAutoToggle}
    />
  );
}

function OverviewTab({
  data,
  readOnlyGmail,
  interviewStats,
}: {
  data: Candidate;
  readOnlyGmail?: boolean;
  interviewStats: InterviewStats | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-6 md:col-span-2">
        <GoogleGmailSyncCard candidateId={data.id} candidateName={data.full_name} readOnly={readOnlyGmail} />
      </div>

      {interviewStats && interviewStats.recent.length > 0 && (
        <div className="space-y-3 md:col-span-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Mail className="w-4 h-4" /> Recent interviews (Gmail &quot;Interview&quot; label · last 7 days)
          </h3>
          <div className="bg-background rounded-lg border border-border divide-y divide-border">
            {interviewStats.recent.map((msg) => (
              <div key={msg.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{msg.subject || '(No subject)'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {msg.from_name || msg.from_email || 'Unknown sender'}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(msg.received_date).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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

function formatSyncLogSummary(log: GmailSyncLog): string {
  if (log.status === 'failed') return log.error_message ?? 'Failed';
  if (log.messages_imported > 0) {
    return `${log.messages_imported} new message${log.messages_imported === 1 ? '' : 's'}`;
  }
  if (log.messages_found > 0) return `${log.messages_found} checked, none new`;
  return 'Up to date';
}

const GMAIL_SOURCE_COLORS: Record<string, string> = {
  LinkedIn: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  Dice: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Other: 'bg-muted text-foreground border-border',
};

function ApplicationsTab({
  apps,
  gmailApplies,
  syncLogs,
}: {
  apps: Application[];
  gmailApplies: GmailApplyMessage[];
  syncLogs: GmailSyncLog[];
}) {
  const hasAny = apps.length > 0 || gmailApplies.length > 0 || syncLogs.length > 0;

  if (!hasAny) {
    return (
      <div className="text-center py-12">
        <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">No application activity yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Gmail Apply messages and sync logs appear here after Gmail is connected and synced.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Gmail Apply label ({gmailApplies.length})
        </h3>
        {gmailApplies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages synced from the Gmail &quot;Apply&quot; label yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Subject / From</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gmailApplies.map((msg) => (
                  <tr key={msg.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate max-w-md">{msg.subject || '(No subject)'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {msg.from_name || msg.from_email || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${GMAIL_SOURCE_COLORS[msg.detected_source] ?? GMAIL_SOURCE_COLORS.Other}`}>
                        {msg.detected_source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(msg.received_date).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Gmail sync logs ({syncLogs.length})
        </h3>
        {syncLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync runs recorded yet.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {syncLogs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  ) : log.status === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium capitalize">{log.status}</span>
                  <span className="text-muted-foreground">· {formatSyncLogSummary(log)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.sync_started_at).toLocaleString()}
                  {log.sync_finished_at && ` → ${new Date(log.sync_finished_at).toLocaleTimeString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {apps.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Manually logged applications ({apps.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
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
                {apps.map((a) => (
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
        </section>
      )}
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
      const resumeText = baseResume.raw_text || baseResume.summary;
      const res = await aiTailorResume(resumeText, jd, data.full_name);
      const tailored = buildTailoredText(resumeText, res, jd);
      setResult({ ...res, tailoredResumeText: tailored });
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
        raw_text: result.tailoredResumeText || '',
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
  const { user } = useAuthStore();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!content.trim()) return;
    if (!user?.id) {
      toast.error("You must be signed in to add a note");
      return;
    }
    setSubmitting(true);
    try {
      await candidateService.addNote(
        data.id,
        content.trim(),
        user.id,
        user.display_name || user.email || 'Staff',
      );
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
                {(n.author_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-1 gap-2">
                  <div className="font-semibold text-sm">{n.author_name || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground shrink-0">{timeAgo(n.created_at)}</div>
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
