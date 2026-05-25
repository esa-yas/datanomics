import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { candidateService } from "@/services/candidateService";
import { resumeService } from "@/services/resumeService";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/dbError";
import type { Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, MoreHorizontal, User, Mail, Phone, Briefcase, Users, Upload, FileText, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  resume_in_progress: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  profile_setup: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  application_started: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  active_search: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  interview_stage: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  offer_received: "bg-green-500/20 text-green-300 border-green-500/30",
  placed: "bg-green-600/20 text-green-400 border-green-600/30",
  paused: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  dropped: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CandidatesPage() {
  const { user } = useAuthStore();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workAuthFilter, setWorkAuthFilter] = useState("all");

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "", work_auth: "USC",
    target_roles: "", skills: "", status: "lead", experience_years: "0",
  });

  // Resume upload within add candidate
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeSection, setResumeSection] = useState(false);

  const loadData = () => {
    setLoading(true);
    candidateService.getAll()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const filteredData = data.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesAuth = workAuthFilter === "all" || c.work_auth === workAuthFilter;
    return matchesSearch && matchesStatus && matchesAuth;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) {
      toast.error("Name and Email are required"); return;
    }
    setIsSubmitting(true);
    try {
      const candidate = await candidateService.create({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        work_auth: formData.work_auth as any,
        target_roles: formData.target_roles.split(",").map(s => s.trim()).filter(Boolean),
        skills: formData.skills.split(",").map(s => s.trim()).filter(Boolean),
        status: formData.status as any,
        experience_years: parseInt(formData.experience_years, 10) || 0,
        preferred_work_modes: ['remote'],
        willing_to_relocate: false,
        country: 'USA',
        preferred_states: [],
        total_applications: 0,
        total_replies: 0,
        total_interviews: 0,
        total_offers: 0,
        tags: [],
        notes: "",
        client_portal_enabled: false,
      });

      // Attach resume if provided
      if (resumeFile || resumeText.trim()) {
        let pdfUrl: string | undefined;
        let docxUrl: string | undefined;
        let rawText = resumeText.trim();

        if (resumeFile) {
          const ext = resumeFile.name.split('.').pop()?.toLowerCase();
          const path = `${candidate.id}/${Date.now()}-${resumeFile.name}`;
          const { data: storageData, error: storageErr } = await supabase.storage
            .from('resumes')
            .upload(path, resumeFile, { cacheControl: '3600', upsert: false });

          if (storageErr) {
            if (storageErr.message?.includes('Bucket not found') || storageErr.message?.includes('does not exist')) {
              toast.error("Storage bucket 'resumes' not found — create it in Supabase Storage. File not saved but candidate was created.");
            } else {
              console.error("Storage error:", storageErr);
              toast.error("File upload failed — candidate was created without resume file.");
            }
          } else {
            const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(storageData.path);
            if (ext === 'pdf') pdfUrl = publicUrl;
            if (ext === 'docx' || ext === 'doc') docxUrl = publicUrl;
            // If .txt file, extract text
            if (ext === 'txt' && !rawText) {
              try { rawText = await resumeFile.text(); } catch {}
            }
          }
        }

        try {
          await resumeService.create({
            candidate_id: candidate.id,
            version_name: 'Base Resume v1',
            version_number: 1,
            type: 'base',
            job_title: formData.target_roles.split(',')[0]?.trim() || '',
            summary: rawText.slice(0, 500),
            skills: formData.skills.split(",").map(s => s.trim()).filter(Boolean),
            experience: [],
            raw_text: rawText,
            pdf_file_url: pdfUrl,
            docx_file_url: docxUrl,
            is_active: true,
            created_by: user?.id || '',
          });
          toast.success("Candidate and resume added successfully");
        } catch (err: any) {
          console.error("Resume create error:", err);
          toast.success("Candidate created — resume record failed to save");
        }
      } else {
        toast.success("Candidate added successfully");
      }

      setIsSheetOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(friendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ full_name: "", email: "", phone: "", work_auth: "USC", target_roles: "", skills: "", status: "lead", experience_years: "0" });
    setResumeFile(null);
    setResumeText("");
    setResumeSection(false);
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Candidates</h1>
        <Sheet open={isSheetOpen} onOpenChange={v => { setIsSheetOpen(v); if (!v) resetForm(); }}>
          <SheetTrigger asChild>
            <Button data-testid="button-add-candidate" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" /> Add Candidate
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto bg-card border-l-border">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-foreground">Add New Candidate</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Info */}
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="full_name" className="pl-9" placeholder="John Doe" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" className="pl-9" placeholder="john@example.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" className="pl-9" placeholder="+1 555-0123" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Work Auth</Label>
                  <Select value={formData.work_auth} onValueChange={v => setFormData({ ...formData, work_auth: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['USC', 'GC', 'H1B', 'OPT', 'CPT', 'TN', 'EAD', 'Other'].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_years">Experience (Years)</Label>
                <Input id="experience_years" type="number" min="0" value={formData.experience_years} onChange={e => setFormData({ ...formData, experience_years: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_roles">Target Roles <span className="text-muted-foreground font-normal">(comma separated)</span></Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="target_roles" className="pl-9" placeholder="Data Analyst, BI Engineer" value={formData.target_roles} onChange={e => setFormData({ ...formData, target_roles: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills <span className="text-muted-foreground font-normal">(comma separated)</span></Label>
                <Input id="skills" placeholder="Python, SQL, Tableau" value={formData.skills} onChange={e => setFormData({ ...formData, skills: e.target.value })} />
              </div>

              {/* Resume Section */}
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setResumeSection(v => !v)}
                  className="flex items-center gap-2 w-full text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  <FileText className="w-4 h-4 text-primary" />
                  Attach Resume
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">(optional — for AI tailoring)</span>
                  <span className="ml-auto text-muted-foreground text-xs">{resumeSection ? '▲' : '▼'}</span>
                </button>

                {resumeSection && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Resume File <span className="font-normal">(PDF, DOCX, TXT)</span></Label>
                      <div
                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => document.getElementById('candidate-resume-file')?.click()}
                      >
                        {resumeFile ? (
                          <div className="flex items-center justify-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-teal-400" />
                            <span className="text-teal-400 font-medium truncate max-w-[220px]">{resumeFile.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                            <Upload className="w-4 h-4" />
                            <span>Click to upload</span>
                          </div>
                        )}
                        <input
                          id="candidate-resume-file"
                          type="file"
                          accept=".pdf,.docx,.doc,.txt"
                          className="hidden"
                          onChange={e => setResumeFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Resume Plain Text <span className="font-normal text-primary">(required for AI Tailor)</span>
                      </Label>
                      <Textarea
                        placeholder="Paste the complete resume text here. The AI reads this to tailor and optimize the resume for each job…"
                        className="min-h-[120px] text-xs bg-background font-mono resize-none"
                        value={resumeText}
                        onChange={e => setResumeText(e.target.value)}
                      />
                      {resumeText.length > 0 && (
                        <p className="text-[11px] text-teal-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {resumeText.length} characters — AI can now tailor this resume
                        </p>
                      )}
                    </div>

                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded text-[11px] text-blue-400">
                      💡 Provide the plain text (copy from Word/PDF) for AI tailoring. The file upload is for storing the original formatted version.
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="bg-primary text-primary-foreground">
                  {isSubmitting ? "Adding…" : (resumeFile || resumeText ? "Add with Resume" : "Add Candidate")}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
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
              {Object.keys(STATUS_COLORS).map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select value={workAuthFilter} onValueChange={setWorkAuthFilter}>
            <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Work Auth" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Auth</SelectItem>
              {['USC', 'GC', 'H1B', 'OPT', 'CPT', 'TN', 'EAD', 'Other'].map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-md" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error loading candidates: {friendlyError(error)}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No candidates found</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            {search || statusFilter !== "all" || workAuthFilter !== "all"
              ? "Try adjusting your filters."
              : "Add your first candidate to get started."}
          </p>
          {!(search || statusFilter !== "all" || workAuthFilter !== "all") && (
            <Button onClick={() => setIsSheetOpen(true)} className="bg-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Add Candidate
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Work Auth</th>
                  <th className="px-4 py-3 font-medium">Target Roles</th>
                  <th className="px-4 py-3 font-medium">Resume</th>
                  <th className="px-4 py-3 font-medium text-right">Apps</th>
                  <th className="px-4 py-3 font-medium text-right">Updated</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setLocation(`/candidates/${c.id}`)}
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase border ${STATUS_COLORS[c.status] || STATUS_COLORS.lead}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                        {c.work_auth}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-muted-foreground max-w-[150px] truncate" title={c.target_roles?.join(', ')}>
                        {c.target_roles?.join(', ') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href="/resumes"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View</span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right font-medium">{c.total_applications || 0}</td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">{timeAgo(c.updated_at)}</td>
                    <td className="px-4 py-4 text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filteredData.length} candidate{filteredData.length !== 1 ? 's' : ''}
            {(search || statusFilter !== "all" || workAuthFilter !== "all") && ` (filtered from ${data.length})`}
          </div>
        </div>
      )}
    </div>
  );
}
