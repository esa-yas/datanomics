import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { candidateService } from "@/services/candidateService";
import { profileService } from "@/services/profileService";
import { importedProfileService } from "@/services/importedProfileService";
import { useCandidates, useInvalidateData, useStaffImports } from "@/hooks/useData";
import { resumeService } from "@/services/resumeService";
import { friendlyError } from "@/lib/dbError";
import { useDataReady } from "@/hooks/useDataReady";
import { QueryError, FetchingHint, ListSkeleton } from "@/components/ui/QueryState";
import { extractResumeContent, isResumeFile, resumeFileAccept } from "@/lib/resume/extractText";
import { parseCandidateFromResumeText } from "@/lib/resume/parseCandidate";
import { uploadResumeFile } from "@/lib/resume/uploadResume";
import { canAddCandidates, canManageCandidateAssignments } from "@/lib/permissions";
import {
  normalizeEmail,
  profileToCandidateForm,
  profileToCandidateCreate,
} from "@/lib/profiles/candidateFromProfile";
import type { ImportedProfile } from "@/lib/profiles/importedProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Plus, MoreHorizontal, User, Mail, Phone, Briefcase, Users, Upload, FileText, CheckCircle, Loader2, Database, IdCard } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import type { Profile } from "@/types";

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

const EMPTY_FORM = {
  full_name: "",
  email: "",
  phone: "",
  work_auth: "USC",
  target_roles: "",
  skills: "",
  status: "lead",
  experience_years: "0",
};

export default function CandidatesPage() {
  const { user } = useAuthStore();
  const [, setLocation] = useLocation();
  const invalidate = useInvalidateData();
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useCandidates();
  const { data: staffImports = [], isPending: importsPending } = useStaffImports();
  const candidates = data ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allowAdd = canAddCandidates(user?.role);
  const showImports = user?.role === 'job_search_assistant' || canManageCandidateAssignments(user?.role);

  const [pageTab, setPageTab] = useState<"list" | "reference">("list");
  const [assistants, setAssistants] = useState<Pick<Profile, "id" | "display_name" | "email">[]>([]);
  const [assigneeId, setAssigneeId] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workAuthFilter, setWorkAuthFilter] = useState("all");

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [createMode, setCreateMode] = useState<"profile" | "resume">("profile");
  const [importedProfiles, setImportedProfiles] = useState<ImportedProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [selectedProfileKey, setSelectedProfileKey] = useState("");

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (canManageCandidateAssignments(user?.role)) {
      profileService.getJobSearchAssistants().then(setAssistants).catch(() => setAssistants([]));
    }
  }, [user?.role]);

  // Lazy-load imported profiles the first time the Add Candidate sheet opens.
  useEffect(() => {
    if (!isSheetOpen || profilesLoaded) return;
    setProfilesLoading(true);
    importedProfileService
      .list()
      .then((rows) => {
        setImportedProfiles(rows);
        setProfilesLoaded(true);
      })
      .catch(() => setImportedProfiles([]))
      .finally(() => setProfilesLoading(false));
  }, [isSheetOpen, profilesLoaded]);

  // Emails that already have a candidate — used to hide already-linked profiles.
  const candidateEmails = useMemo(
    () => new Set(candidates.map((c) => normalizeEmail(c.email)).filter(Boolean)),
    [candidates],
  );

  const unlinkedProfiles = useMemo(
    () => importedProfiles.filter((p) => p.email && !candidateEmails.has(normalizeEmail(p.email))),
    [importedProfiles, candidateEmails],
  );

  const selectedProfile = useMemo(
    () => importedProfiles.find((p) => p.key === selectedProfileKey) ?? null,
    [importedProfiles, selectedProfileKey],
  );

  const handleSelectProfile = (key: string) => {
    setSelectedProfileKey(key);
    const profile = importedProfiles.find((p) => p.key === key);
    if (profile) {
      setFormData((prev) => ({ ...prev, ...profileToCandidateForm(profile) }));
    }
  };

  const filteredData = candidates.filter((c) => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesAuth = workAuthFilter === "all" || c.work_auth === workAuthFilter;
    return matchesSearch && matchesStatus && matchesAuth;
  });

  const handleResumeFile = async (file: File | null) => {
    if (!file) return;
    if (!isResumeFile(file)) {
      toast.error("Only PDF and DOCX files are supported.");
      return;
    }

    setResumeFile(file);
    setIsParsing(true);
    setExtractedText("");

    try {
      const extracted = await extractResumeContent(file);
      setExtractedText(extracted.plainText);
      const parsed = parseCandidateFromResumeText(extracted.plainText);

      setFormData((prev) => ({
        ...prev,
        full_name: parsed.full_name || prev.full_name,
        email: parsed.email || prev.email,
        phone: parsed.phone || prev.phone,
        target_roles:
          parsed.target_roles?.length ? parsed.target_roles.join(", ") : prev.target_roles,
        skills: parsed.skills?.length ? parsed.skills.join(", ") : prev.skills,
        experience_years:
          parsed.experience_years !== undefined
            ? String(parsed.experience_years)
            : prev.experience_years,
      }));

      toast.success("Resume read — review the fields below and save.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not read resume file.";
      toast.error(msg);
      setResumeFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const attachResumeAfterCreate = async (
    candidateId: string,
    file: File,
    rawText: string,
    skills: string[],
    jobTitle: string,
  ) => {
    try {
      const { pdfUrl, docxUrl } = await uploadResumeFile(candidateId, file);
      await resumeService.create({
        candidate_id: candidateId,
        version_name: "Base Resume v1",
        version_number: 1,
        type: "base",
        job_title: jobTitle,
        summary: rawText.slice(0, 500),
        skills,
        experience: [],
        raw_text: rawText,
        pdf_file_url: pdfUrl,
        docx_file_url: docxUrl,
        is_active: true,
        created_by: user?.id || "",
      });
      invalidate.resumes();
    } catch (err) {
      console.error("Resume attach failed:", err);
      toast.error("Candidate saved — resume file could not be stored. Upload again from Resumes.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.full_name.trim() || !formData.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }

    const skills = formData.skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const targetRoles = formData.target_roles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const assigneeFields = assigneeId
      ? { primary_assignee_id: assigneeId, application_specialist_id: assigneeId }
      : {};

    // --- Create from imported profile (no resume — resumes are tailored separately) ---
    if (createMode === "profile") {
      if (!selectedProfile) {
        toast.error("Select a profile to create the candidate from.");
        return;
      }
      setIsSubmitting(true);
      try {
        const candidate = await candidateService.create(
          profileToCandidateCreate(selectedProfile, {
            full_name: formData.full_name.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim() || "—",
            work_auth: formData.work_auth as never,
            target_roles: targetRoles,
            skills,
            status: formData.status as never,
            experience_years: parseInt(formData.experience_years, 10) || 0,
            ...assigneeFields,
          }),
        );
        invalidate.addCandidate(candidate);
        setIsSheetOpen(false);
        resetForm();
        toast.success("Candidate created from profile.");
        setLocation(`/candidates/${candidate.id}`);
      } catch (err: unknown) {
        toast.error(friendlyError(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // --- Create from resume upload ---
    if (!resumeFile || !extractedText) {
      toast.error("Upload a PDF or DOCX resume first.");
      return;
    }

    const jobTitle = targetRoles[0] || "";
    const file = resumeFile;
    const rawText = extractedText;

    setIsSubmitting(true);
    try {
      const candidate = await candidateService.create({
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || "—",
        work_auth: formData.work_auth as never,
        target_roles: targetRoles,
        skills,
        status: formData.status as never,
        experience_years: parseInt(formData.experience_years, 10) || 0,
        preferred_work_modes: ["remote"],
        willing_to_relocate: false,
        country: "USA",
        preferred_states: [],
        total_applications: 0,
        total_replies: 0,
        total_interviews: 0,
        total_offers: 0,
        tags: [],
        notes: "",
        client_portal_enabled: false,
        ...assigneeFields,
      });

      invalidate.addCandidate(candidate);
      setIsSheetOpen(false);
      resetForm();
      toast.success("Candidate added — saving resume…");

      void attachResumeAfterCreate(candidate.id, file, rawText, skills, jobTitle);
    } catch (err: unknown) {
      toast.error(friendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setAssigneeId("");
    setResumeFile(null);
    setExtractedText("");
    setIsParsing(false);
    setCreateMode("profile");
    setSelectedProfileKey("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  };

  const fieldsEnabled = createMode === "profile" ? !!selectedProfileKey : !!extractedText;
  const canSubmit =
    createMode === "profile"
      ? !!selectedProfile && !!formData.full_name.trim() && !!formData.email.trim() && !isSubmitting
      : !!resumeFile && !!extractedText && !isParsing && !isSubmitting;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Candidates</h1>
        {allowAdd && pageTab === "list" && (
        <Sheet
          open={isSheetOpen}
          onOpenChange={(v) => {
            setIsSheetOpen(v);
            if (!v) resetForm();
          }}
        >
          <SheetTrigger asChild>
            <Button data-testid="button-add-candidate" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" /> Add Candidate
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto bg-card border-l-border">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-foreground">Add New Candidate</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Create from an imported intake profile, or upload a resume. Resumes are tailored
                separately, so they aren&apos;t required when creating from a profile.
              </p>
            </SheetHeader>

            {/* Create-mode toggle */}
            <div className="mb-5 flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setCreateMode("profile")}
                className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
                  createMode === "profile"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <IdCard className="w-4 h-4" /> From profile
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("resume")}
                className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
                  createMode === "resume"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <FileText className="w-4 h-4" /> From resume
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {createMode === "profile" ? (
                <div className="space-y-2">
                  <Label>Imported profile *</Label>
                  {profilesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading profiles…
                    </div>
                  ) : unlinkedProfiles.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      {importedProfiles.length === 0 ? (
                        <>
                          No imported profiles found.{" "}
                          <Link href="/profiles" className="text-primary hover:underline">
                            Import intake JSON
                          </Link>{" "}
                          first, or switch to “From resume”.
                        </>
                      ) : (
                        "Every imported profile already has a candidate. Switch to “From resume” to add someone new."
                      )}
                    </div>
                  ) : (
                    <>
                      <Select value={selectedProfileKey} onValueChange={handleSelectProfile}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a profile to create…" />
                        </SelectTrigger>
                        <SelectContent>
                          {unlinkedProfiles.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.name}
                              {p.email ? ` · ${p.email}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {unlinkedProfiles.length} profile{unlinkedProfiles.length === 1 ? "" : "s"} not yet
                        created as candidates. Fields below are prefilled — edit as needed.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Resume (PDF or DOCX) *</Label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                      isParsing
                        ? "border-primary/50 bg-primary/5"
                        : resumeFile
                          ? "border-teal-500/40 bg-teal-500/5"
                          : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => !isParsing && fileInputRef.current?.click()}
                  >
                    {isParsing ? (
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span>Reading resume…</span>
                      </div>
                    ) : resumeFile ? (
                      <div className="flex flex-col items-center gap-1">
                        <CheckCircle className="w-5 h-5 text-teal-400" />
                        <span className="text-sm font-medium text-teal-400 truncate max-w-[260px]">
                          {resumeFile.name}
                        </span>
                        {extractedText && (
                          <span className="text-[11px] text-muted-foreground">
                            {extractedText.length.toLocaleString()} characters extracted
                          </span>
                        )}
                        <span className="text-[11px] text-primary mt-1">Click to replace file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                        <Upload className="w-5 h-5" />
                        <span>Click to upload PDF or DOCX</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={resumeFileAccept()}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleResumeFile(f);
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="full_name"
                    className="pl-9"
                    placeholder="From resume"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    disabled={!fieldsEnabled}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    placeholder="From resume"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!fieldsEnabled}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    className="pl-9"
                    placeholder="From resume"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={!fieldsEnabled}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Work Auth</Label>
                  <Select
                    value={formData.work_auth}
                    onValueChange={(v) => setFormData({ ...formData, work_auth: v })}
                    disabled={!fieldsEnabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["USC", "GC", "H1B", "OPT", "CPT", "TN", "EAD", "Other"].map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) => setFormData({ ...formData, status: v })}
                    disabled={!fieldsEnabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_COLORS).map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_years">Experience (Years)</Label>
                <Input
                  id="experience_years"
                  type="number"
                  min="0"
                  value={formData.experience_years}
                  onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                  disabled={!fieldsEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_roles">
                  Target Roles{" "}
                  <span className="text-muted-foreground font-normal">(comma separated)</span>
                </Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="target_roles"
                    className="pl-9"
                    placeholder="From resume"
                    value={formData.target_roles}
                    onChange={(e) => setFormData({ ...formData, target_roles: e.target.value })}
                    disabled={!fieldsEnabled}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">
                  Skills <span className="text-muted-foreground font-normal">(comma separated)</span>
                </Label>
                <Input
                  id="skills"
                  placeholder="From resume"
                  value={formData.skills}
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  disabled={!fieldsEnabled}
                />
              </div>

              {assistants.length > 0 && (
                <div className="space-y-2">
                  <Label>Assign job search assistant</Label>
                  <Select value={assigneeId || "unassigned"} onValueChange={(v) => setAssigneeId(v === "unassigned" ? "" : v)} disabled={!fieldsEnabled}>
                    <SelectTrigger><SelectValue placeholder="Select assistant…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assistants.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="bg-primary text-primary-foreground"
                >
                  {isSubmitting ? "Saving…" : "Add Candidate"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
        )}
      </div>

      {showImports && (
        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setPageTab("list")}
            className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 ${pageTab === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/50"}`}
          >
            <Users className="w-4 h-4" /> Candidate list
          </button>
          <button
            type="button"
            onClick={() => setPageTab("reference")}
            className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 ${pageTab === "reference" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/50"}`}
          >
            <Database className="w-4 h-4" /> Reference data
          </button>
        </div>
      )}

      {pageTab === "reference" ? (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Admin reference data</h2>
          <p className="text-sm text-muted-foreground">
            JSON or text your admin pasted on the Team page for your workflow.
          </p>
          {importsPending ? (
            <ListSkeleton rows={2} />
          ) : staffImports.length === 0 ? (
            <p className="text-muted-foreground text-sm">No reference data has been imported yet.</p>
          ) : (
            staffImports.map((imp) => (
              <div key={imp.id} className="space-y-2">
                {user?.role !== "job_search_assistant" && (
                  <div className="text-sm font-medium">
                    {(imp.profiles as { display_name?: string } | null)?.display_name ?? imp.staff_user_id}
                  </div>
                )}
                <pre className="text-xs font-mono bg-background border border-border rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                  {imp.raw_text ?? JSON.stringify(imp.import_data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            className="pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.keys(STATUS_COLORS).map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select value={workAuthFilter} onValueChange={setWorkAuthFilter}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder="All Work Auth" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Auth</SelectItem>
              {["USC", "GC", "H1B", "OPT", "CPT", "TN", "EAD", "Other"].map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <FetchingHint show={ready && isFetching && isFetched} />

      {!ready || isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} label="Failed to load candidates" />
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
          {!(search || statusFilter !== "all" || workAuthFilter !== "all") && allowAdd && (
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
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {c.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase border ${STATUS_COLORS[c.status] || STATUS_COLORS.lead}`}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                        {c.work_auth}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div
                        className="text-xs text-muted-foreground max-w-[150px] truncate"
                        title={c.target_roles?.join(", ")}
                      >
                        {c.target_roles?.join(", ") || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href="/resumes"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View</span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right font-medium">{c.total_applications || 0}</td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(c.updated_at)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filteredData.length} candidate{filteredData.length !== 1 ? "s" : ""}
            {(search || statusFilter !== "all" || workAuthFilter !== "all") &&
              ` (filtered from ${candidates.length})`}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
