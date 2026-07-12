import { useState } from "react";
import { Link } from "wouter";
import { applicationService } from "@/services/applicationService";
import { useApplications, useCandidatesPicklist, useGmailApplyMessages, useInvalidateData } from "@/hooks/useData";
import { useDataReady } from "@/hooks/useDataReady";
import { QueryError, FetchingHint, ListSkeleton } from "@/components/ui/QueryState";
import { computeQualityScore } from "@/lib/utils/qualityScore";
import type { Application } from "@/types";
import type { GmailApplyMessage } from "@/services/gmailSyncService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Search, Filter, Flag, MoreHorizontal, Link as LinkIcon, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

const SOURCE_COLORS: Record<string, string> = {
  linkedin: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  dice: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  indeed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  default: "bg-muted text-foreground border-border",
};

const GMAIL_SOURCE_COLORS: Record<string, string> = {
  LinkedIn: SOURCE_COLORS.linkedin,
  Dice: SOURCE_COLORS.dice,
  Other: SOURCE_COLORS.default,
};

function formatGmailFrom(msg: GmailApplyMessage): string {
  if (msg.from_name && msg.from_email) return `${msg.from_name} <${msg.from_email}>`;
  return msg.from_name || msg.from_email || "—";
}

function candidateNameFromGmail(msg: GmailApplyMessage): string {
  return msg.candidates?.full_name ?? "Unknown";
}

export default function ApplicationsPage() {
  const { user } = useAuthStore();
  const invalidate = useInvalidateData();
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useApplications();
  const applications = data ?? [];
  const {
    data: gmailMessages = [],
    isPending: gmailPending,
    isError: gmailError,
    error: gmailErr,
    refetch: refetchGmail,
  } = useGmailApplyMessages();
  const { data: candidates = [] } = useCandidatesPicklist();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFlagged, setShowFlagged] = useState(false);

  // Form State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    candidate_id: "", job_title: "", company: "", work_mode: "remote", job_source: "linkedin", job_url: "", pay_rate: "", pay_type: "hourly_w2", notes: ""
  });
  const [qualityChecks, setQualityChecks] = useState({
    quality_resume_tailored: false,
    quality_location_verified: false,
    quality_salary_verified: false,
    quality_auth_verified: false,
    quality_duplicate_checked: false,
    quality_notes_added: false,
  });

  const filteredData = applications.filter(a => {
    const matchesSearch = a.company.toLowerCase().includes(search.toLowerCase()) || 
                          a.candidate_name.toLowerCase().includes(search.toLowerCase()) ||
                          a.job_title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesFlagged = !showFlagged || a.flagged;
    return matchesSearch && matchesStatus && matchesFlagged;
  });

  const filteredGmail = gmailMessages.filter((msg) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const from = formatGmailFrom(msg).toLowerCase();
    const subject = (msg.subject ?? "").toLowerCase();
    const candidate = candidateNameFromGmail(msg).toLowerCase();
    return from.includes(q) || subject.includes(q) || candidate.includes(q);
  });

  const handleLogApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.candidate_id || !formData.company || !formData.job_title) {
      toast.error("Candidate, Company, and Job Title are required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const selectedCand = candidates.find(c => c.id === formData.candidate_id);
      await applicationService.create({
        candidate_id: formData.candidate_id,
        candidate_name: selectedCand?.full_name || "Unknown",
        applied_by: user?.id || "system",
        applied_by_name: user?.display_name || "System User",
        job_title: formData.job_title,
        company: formData.company,
        work_mode: formData.work_mode as any,
        job_source: formData.job_source as any,
        job_url: formData.job_url,
        pay_rate: formData.pay_rate ? parseFloat(formData.pay_rate) : undefined,
        pay_type: formData.pay_type as any,
        status: 'applied',
        cover_letter_used: false,
        ...qualityChecks,
        quality_score: computeQualityScore(qualityChecks),
        notes: formData.notes,
        missing_keywords: [],
        flagged: false,
      });
      toast.success("Application logged successfully");
      setIsSheetOpen(false);
      invalidate.applications();
    } catch (err: any) {
      toast.error(err.message || "Failed to log application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFlag = async (id: string, currentFlagged: boolean) => {
    try {
      if (currentFlagged) {
        await applicationService.unflag(id);
      } else {
        await applicationService.flag(id, "Flagged manually");
      }
      invalidate.applications();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-primary";
    if (score >= 60) return "bg-yellow-500";
    return "bg-destructive";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Applications Tracker</h1>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button className="bg-primary text-primary-foreground">Log Application</Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-xl overflow-y-auto bg-card border-l-border">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-foreground">Log New Application</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleLogApp} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Candidate *</Label>
                  <Select value={formData.candidate_id} onValueChange={v => setFormData({...formData, candidate_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select candidate..." /></SelectTrigger>
                    <SelectContent>
                      {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company *</Label>
                    <Input value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} placeholder="Tech Corp" />
                  </div>
                  <div className="space-y-2">
                    <Label>Job Title *</Label>
                    <Input value={formData.job_title} onChange={e => setFormData({...formData, job_title: e.target.value})} placeholder="Frontend Engineer" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select value={formData.job_source} onValueChange={v => setFormData({...formData, job_source: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['linkedin', 'dice', 'indeed', 'direct', 'referral', 'other'].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Work Mode</Label>
                    <Select value={formData.work_mode} onValueChange={v => setFormData({...formData, work_mode: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['remote', 'hybrid', 'onsite'].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Job URL</Label>
                  <Input value={formData.job_url} onChange={e => setFormData({...formData, job_url: e.target.value})} placeholder="https://..." />
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-semibold mb-3 flex justify-between items-center">
                  <span>Quality Checklist</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${getScoreColor(computeQualityScore(qualityChecks))} text-white`}>
                    Score: {computeQualityScore(qualityChecks)}%
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'quality_resume_tailored', label: "Resume Tailored", weight: 30 },
                    { key: 'quality_location_verified', label: "Location Verified", weight: 20 },
                    { key: 'quality_salary_verified', label: "Salary Verified", weight: 15 },
                    { key: 'quality_auth_verified', label: "Work Auth Verified", weight: 15 },
                    { key: 'quality_duplicate_checked', label: "Duplicate Checked", weight: 10 },
                    { key: 'quality_notes_added', label: "Notes Added", weight: 10 },
                  ].map(({ key, label, weight }) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox 
                        id={key} 
                        checked={(qualityChecks as any)[key]} 
                        onCheckedChange={c => setQualityChecks({...qualityChecks, [key]: !!c})} 
                      />
                      <label htmlFor={key} className="text-sm font-medium leading-none cursor-pointer">
                        {label} <span className="text-muted-foreground text-xs font-normal">({weight}%)</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Logging..." : "Log Application"}</Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search company, title, candidate..." 
            className="pl-9 bg-card border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {['applied', 'viewed', 'recruiter_replied', 'phone_screen', 'interview_scheduled', 'interview_done', 'final_round', 'offer', 'rejected', 'ghosted'].map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button 
          variant="outline" 
          className={`w-full sm:w-auto border-border ${showFlagged ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-card text-muted-foreground'}`}
          onClick={() => setShowFlagged(!showFlagged)}
        >
          <Flag className={`w-4 h-4 mr-2 ${showFlagged ? 'fill-destructive text-destructive' : ''}`} /> Flagged Only
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Gmail Apply confirmations
          </h2>
          <span className="text-xs text-muted-foreground">Headers only · from synced Apply label</span>
        </div>

        {gmailPending && ready ? (
          <ListSkeleton />
        ) : gmailError ? (
          <QueryError error={gmailErr} onRetry={() => refetchGmail()} label="Failed to load Gmail apply emails" />
        ) : filteredGmail.length === 0 ? (
          <div className="bg-card rounded-lg border border-border py-10 text-center text-muted-foreground text-sm">
            {gmailMessages.length === 0
              ? "No Gmail Apply emails synced yet. Connect a candidate’s Google account to start tracking."
              : "No Gmail emails match your search."}
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-foreground">
                <thead className="bg-muted text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Candidate</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">From</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Source</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredGmail.map((msg) => (
                    <tr key={msg.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/candidates/${msg.candidate_id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          {candidateNameFromGmail(msg)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={formatGmailFrom(msg)}>
                        {formatGmailFrom(msg)}
                      </td>
                      <td className="px-4 py-3 font-medium max-w-md truncate" title={msg.subject ?? undefined}>
                        {msg.subject || <span className="text-muted-foreground italic">No subject</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${GMAIL_SOURCE_COLORS[msg.detected_source] ?? SOURCE_COLORS.default}`}
                        >
                          {msg.detected_source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(msg.received_date).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-display font-bold">Logged applications</h2>
      </div>

      <FetchingHint show={ready && isFetching && isFetched} />

      {!ready || isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} label="Failed to load applications" />
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center text-muted-foreground">
          No applications match your filters.
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Candidate</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Company & Role</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Source</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Quality</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Date</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((app) => (
                  <tr 
                    key={app.id} 
                    className={`hover:bg-muted/30 transition-colors ${app.flagged ? 'bg-red-500/5 border-l-2 border-l-destructive' : 'border-l-2 border-l-transparent'}`}
                  >
                    <td className="px-4 py-4">
                      <Link href={`/candidates/${app.candidate_id}`} className="font-semibold text-foreground hover:text-primary transition-colors">
                        {app.candidate_name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-foreground flex items-center gap-1">
                        {app.company}
                        {app.job_url && <a href={app.job_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><LinkIcon className="w-3 h-3" /></a>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{app.job_title}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SOURCE_COLORS[app.job_source] || SOURCE_COLORS.default}`}>
                        {app.job_source}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide bg-secondary/10 text-secondary border border-secondary/20">
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 w-32">
                      <div className="flex flex-col gap-1 w-full max-w-[120px]">
                        <Progress 
                          value={app.quality_score} 
                          className="h-1.5 w-full bg-muted overflow-hidden" 
                          indicatorClassName={getScoreColor(app.quality_score)}
                        />
                        <span className="text-[10px] text-muted-foreground font-mono text-right">{app.quality_score}/100</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(app.applied_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${app.flagged ? 'text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => toggleFlag(app.id, app.flagged)}
                      >
                        <Flag className={`h-4 w-4 ${app.flagged ? 'fill-destructive' : ''}`} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
