import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { resumeService } from "@/services/resumeService";
import { useResumes, useCandidatesPicklist, useInvalidateData, type ResumeListRow } from "@/hooks/useData";
import { useDataReady } from "@/hooks/useDataReady";
import { useTailoredDocumentPreview } from "@/hooks/useTailoredDocumentPreview";
import { QueryError, FetchingHint, ListSkeleton } from "@/components/ui/QueryState";
import { aiTailorResume } from "@/lib/ai";
import { buildTailoredText, type TailorResult } from "@/lib/utils/resumeTailor";
import { downloadBlob, safeFilename, buildTailoredDocxBlob } from "@/lib/resume/exportTailored";
import { withTimeout } from "@/lib/fetchUtils";
import { computeJdMatchPreview } from "@/lib/resume/jdMatchPreview";
import {
  extractResumeContent,
  extractResumeFromDocxUrl,
  extractDocxParagraphTexts,
  isResumeFile,
  resumeFileAccept,
} from "@/lib/resume/extractText";
import { uploadResumeFile } from "@/lib/resume/uploadResume";
import { ResumePdfPreview } from "@/components/resume/ResumeDocumentView";
import { FaithfulResumeView } from "@/components/resume/FaithfulResumeView";
import { AiThinkingBubble } from "@/components/resume/StyledResumeView";
import { ResumeHtmlPreview } from "@/components/resume/ResumeHtmlPreview";
import { useLiveTailorReveal } from "@/hooks/useLiveTailorReveal";
import { useSourceDocxInner } from "@/hooks/useDocxHtmlPreview";
import { wrapMammothInnerHtml } from "@/lib/resume/resumeHeader";
import { createSourceResumeSnapshot, isValidSourceSnapshot, pickImmutableSourceText, type SourceResumeSnapshot } from "@/lib/resume/sourceResumeSnapshot";
import { enableResumeExportDebug } from "@/lib/resume/exportTailored";
import type { ResumeLine } from "@/lib/resume/resumeLines";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Download, ArrowRight, Sparkles, Upload, ChevronLeft, CheckCircle, RotateCcw, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

function resumeCandidateName(candidates: unknown): string {
  if (!candidates) return "Unknown";
  if (Array.isArray(candidates)) return (candidates[0] as { full_name?: string })?.full_name ?? "Unknown";
  return (candidates as { full_name?: string }).full_name ?? "Unknown";
}

const ANALYSIS_STEPS = [
  { msg: "Reading resume structure and sections…", pct: 10 },
  { msg: "Parsing job requirements and must-haves…", pct: 20 },
  { msg: "Calculating baseline ATS match score…", pct: 32 },
  { msg: "Identifying missing keywords and skill gaps…", pct: 46 },
  { msg: "Rewriting bullet points for stronger alignment…", pct: 58 },
  { msg: "Optimizing the professional summary…", pct: 70 },
  { msg: "Adjusting skills section for ATS parsing…", pct: 82 },
  { msg: "Recalculating post-optimization ATS score…", pct: 91 },
  { msg: "Finalizing tailored version…", pct: 97 },
];

export default function ResumesPage() {
  const { user } = useAuthStore();
  const invalidate = useInvalidateData();
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useResumes();
  const resumes = data ?? [];
  const { data: candidates = [] } = useCandidatesPicklist();
  const [candidateFilter, setCandidateFilter] = useState("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [customVersion, setCustomVersion] = useState("");

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCandId, setUploadCandId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadVersionName, setUploadVersionName] = useState("Base Resume v1");
  const [isUploading, setIsUploading] = useState(false);
  const [isParsingUpload, setIsParsingUpload] = useState(false);

  // Tailor mode
  const [tailorMode, setTailorMode] = useState(false);
  const [tailorStep, setTailorStep] = useState<'setup' | 'processing' | 'revealing' | 'result'>('setup');
  const [tailorCandId, setTailorCandId] = useState("");
  const [jd, setJd] = useState("");
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [editableTailoredText, setEditableTailoredText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [aiPending, setAiPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [debouncedJd, setDebouncedJd] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveReveal = useLiveTailorReveal();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedJd(jd), 320);
    return () => clearTimeout(t);
  }, [jd]);

  // Cleanup interval on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // Distinct version numbers present in the data (for the V1/V2/V3… options).
  const availableVersions = useMemo(() => {
    const nums = new Set<number>();
    for (const r of resumes) {
      if (typeof r.version_number === "number") nums.add(r.version_number);
    }
    return Array.from(nums).sort((a, b) => a - b);
  }, [resumes]);

  const filteredData = useMemo(() => {
    const custom = customVersion.trim().toLowerCase();
    return resumes.filter((r) => {
      if (candidateFilter !== "all" && r.candidate_id !== candidateFilter) return false;
      if (versionFilter === "all") return true;
      if (versionFilter === "base") return r.type === "base";
      if (versionFilter === "custom") {
        if (!custom) return true;
        return (
          (r.version_name?.toLowerCase().includes(custom) ?? false) ||
          `v${r.version_number}` === custom ||
          String(r.version_number) === custom ||
          (r.type?.toLowerCase().includes(custom) ?? false)
        );
      }
      if (versionFilter.startsWith("v")) {
        return r.version_number === Number(versionFilter.slice(1));
      }
      return true;
    });
  }, [resumes, candidateFilter, versionFilter, customVersion]);

  // Current tailor candidate's resume (user can pick version)
  const tailorCandResumes = resumes.filter(r => r.candidate_id === tailorCandId);
  const tailorBaseResume =
    tailorCandResumes.find(r => r.id === selectedResumeId) ||
    tailorCandResumes.find(r => r.type === 'base') ||
    tailorCandResumes[0];
  const tailorCandName = candidates.find(c => c.id === tailorCandId)?.full_name || '';

  const getResumeText = (resume: ResumeListRow | undefined) =>
    resume?.raw_text?.trim() || resume?.summary?.trim() || '';

  const originalTextForTailor = getResumeText(tailorBaseResume);
  const [enrichedText, setEnrichedText] = useState("");
  const [resumeLines, setResumeLines] = useState<ResumeLine[]>([]);

  useEffect(() => {
    if (!tailorMode || !tailorBaseResume) {
      setEnrichedText("");
      setResumeLines([]);
      return;
    }
    const stored = originalTextForTailor;
    if (tailorBaseResume.docx_file_url) {
      extractResumeFromDocxUrl(tailorBaseResume.docx_file_url)
        .then((r) => {
          setEnrichedText(r.plainText || stored);
          setResumeLines(r.lines ?? []);
        })
        .catch(() => {
          setEnrichedText(stored);
          setResumeLines([]);
        });
    } else {
      setEnrichedText(stored);
      setResumeLines([]);
    }
  }, [tailorMode, tailorBaseResume?.id, tailorBaseResume?.docx_file_url, originalTextForTailor]);

  const resumeTextForTailor = enrichedText || originalTextForTailor;

  /** Frozen once per resume — never derived from tailored/preview text. */
  const [immutableSnapshot, setImmutableSnapshot] = useState<SourceResumeSnapshot | undefined>();
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) enableResumeExportDebug();
  }, []);

  useEffect(() => {
    if (!tailorMode || !tailorBaseResume) {
      setImmutableSnapshot(undefined);
      setSnapshotLoading(false);
      return;
    }

    let cancelled = false;
    const stored = originalTextForTailor;
    setSnapshotLoading(true);

    async function loadImmutableSnapshot() {
      try {
        let docxPlain = "";
        let docxParagraphs: string[] | undefined;
        if (tailorBaseResume?.docx_file_url) {
          const res = await fetch(tailorBaseResume.docx_file_url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const extracted = await extractResumeFromDocxUrl(tailorBaseResume.docx_file_url);
            docxPlain = extracted.plainText || "";
            docxParagraphs = await extractDocxParagraphTexts(buffer);
          }
        }
        if (cancelled) return;
        setImmutableSnapshot(
          createSourceResumeSnapshot(stored, {
            storedText: stored,
            docxPlainText: docxPlain,
            docxParagraphs,
            candidateNameHint: tailorCandName || undefined,
          }),
        );
      } catch {
        if (!cancelled) {
          setImmutableSnapshot(
            createSourceResumeSnapshot(stored, { candidateNameHint: tailorCandName || undefined }),
          );
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    }

    loadImmutableSnapshot();
    return () => {
      cancelled = true;
    };
  }, [tailorMode, tailorBaseResume?.id, tailorBaseResume?.docx_file_url, originalTextForTailor, tailorCandName]);
  const previewTailoredText =
    tailorResult && (tailorStep === 'revealing' || tailorStep === 'result')
      ? editableTailoredText || buildTailoredText(resumeTextForTailor, tailorResult, jd)
      : '';

  const docPreview = useTailoredDocumentPreview(
    tailorMode && previewTailoredText ? previewTailoredText : '',
    editMode ? [] : (tailorResult?.sectionChanges ?? []),
    tailorBaseResume?.docx_file_url,
    resumeLines.length ? resumeLines : undefined,
    tailorResult ?? undefined,
    immutableSnapshot?.originalText,
    jd,
    immutableSnapshot,
  );

  const snapshotReady = !!immutableSnapshot && isValidSourceSnapshot(immutableSnapshot);

  const tailoredTextForPreview =
    editableTailoredText ||
    (tailorResult ? buildTailoredText(resumeTextForTailor, tailorResult, jd) : '');

  const sourceDocx = tailorBaseResume?.docx_file_url;
  const { innerHtml: sourceDocxInner } = useSourceDocxInner(tailorMode ? sourceDocx : undefined);

  const sourceDocxHtml = useMemo(
    () => (sourceDocxInner ? wrapMammothInnerHtml(sourceDocxInner) : null),
    [sourceDocxInner],
  );

  const tailoredDocxHtml = useMemo(() => {
    if (docPreview.docxInnerHtml) return wrapMammothInnerHtml(docPreview.docxInnerHtml);
    return sourceDocxHtml;
  }, [docPreview.docxInnerHtml, sourceDocxHtml]);

  const jdLivePreview = useMemo(
    () => (tailorMode && originalTextForTailor ? computeJdMatchPreview(debouncedJd, originalTextForTailor) : null),
    [tailorMode, debouncedJd, originalTextForTailor],
  );

  const jdHighlightNeedles = useMemo(() => {
    if (!jdLivePreview) return [];
    return [...jdLivePreview.impactMatched, ...jdLivePreview.matched.filter((m) => !jdLivePreview.impactMatched.includes(m))];
  }, [jdLivePreview]);

  // Auto-select base resume when candidate changes
  useEffect(() => {
    if (!tailorCandId) {
      setSelectedResumeId("");
      return;
    }
    const cResumes = resumes.filter(r => r.candidate_id === tailorCandId);
    const base = cResumes.find(r => r.type === 'base') || cResumes[0];
    setSelectedResumeId(base?.id || "");
  }, [tailorCandId, resumes]);

  const startAnalysisAnimation = () => {
    setAnalysisStep(0);
    setAnalysisProgress(0);
    let step = 0;
    intervalRef.current = setInterval(() => {
      step++;
      if (step < ANALYSIS_STEPS.length) {
        setAnalysisStep(step);
        setAnalysisProgress(ANALYSIS_STEPS[step].pct);
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 1400);
  };

  const handleTailor = async () => {
    if (aiPending) return;
    if (!tailorCandId) { toast.error("Select a candidate"); return; }
    if (!jd.trim()) { toast.error("Paste a job description"); return; }
    const resumeText = resumeTextForTailor || getResumeText(tailorBaseResume);
    if (!resumeText) {
      toast.error("This candidate has no resume text. Upload a resume with pasted text first.");
      return;
    }
    setTailorStep('processing');
    setEditMode(false);
    setAiPending(true);
    setAiStatus("");
    setTailorResult(null);
    setEditableTailoredText("");
    liveReveal.waitForAi(resumeText);
    startAnalysisAnimation();
    try {
      const res = await aiTailorResume(resumeText, jd, tailorCandName, (msg) => {
        setAiStatus(msg);
        if (msg) liveReveal.setThinkingMessage(msg);
      });
      if (intervalRef.current) clearInterval(intervalRef.current);
      setAnalysisProgress(100);
      setTailorResult(res);
      setTailorStep('revealing');
      const final = await liveReveal.revealResult(resumeText, res, jd);
      if (!final.trim()) {
        throw new Error('Tailored resume is empty. Try running Analyze again.');
      }
      setEditableTailoredText(final);
      setTailorStep('result');
    } catch (err: unknown) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      liveReveal.cancel();
      const message = err instanceof Error ? err.message : "Tailoring failed";
      toast.error(message);
      setTailorStep('setup');
    } finally {
      setAiPending(false);
      setAiStatus("");
    }
  };

  const downloadTailored = (format: 'pdf' | 'docx') => {
    const text = tailoredTextForPreview;
    if (!text.trim()) {
      toast.error('No tailored resume to download.');
      return;
    }
    if (snapshotLoading || !snapshotReady) {
      toast.error('Original resume snapshot is still loading — wait a moment.');
      return;
    }
    if (docPreview.error) {
      toast.error(docPreview.error);
      return;
    }
    const blob = format === 'pdf' ? docPreview.pdfBlob : docPreview.docxBlob;
    if (format === 'pdf' && !docPreview.isPdfReady) {
      toast.error('PDF is still generating — wait a moment.');
      return;
    }
    if (format === 'docx' && !docPreview.isDocxReady) {
      toast.error('DOCX is still generating — wait a moment.');
      return;
    }
    if (!blob) {
      toast.error('Document is still generating — wait a moment.');
      return;
    }
    const safeName = safeFilename(tailorCandName || 'candidate');
    const title = safeFilename(tailorResult?.suggestedTitle || 'tailored');
    downloadBlob(blob, `${safeName}_${title}.${format}`);
    toast.success(`${format.toUpperCase()} download started`);
  };

  const handleSaveTailored = async () => {
    if (!tailorCandId || !tailorResult) return;
    const rawText = tailoredTextForPreview.trim();
    if (!rawText) {
      toast.error('No tailored content to save.');
      return;
    }

    setIsSaving(true);
    const savingToast = toast.loading('Saving tailored resume…');
    try {
      let createdBy = user?.id;
      if (!createdBy) {
        const { data: authData } = await withTimeout(supabase.auth.getUser(), 10_000, 'Auth check');
        createdBy = authData.user?.id;
      }
      if (!createdBy) {
        throw new Error('You must be logged in to save a resume version.');
      }

      let docxBlob = docPreview.docxBlob;
      if (!docxBlob) {
        toast.loading('Building DOCX…', { id: savingToast });
        docxBlob = await withTimeout(buildTailoredDocxBlob(rawText), 30_000, 'DOCX build');
      }

      toast.loading('Saving to database…', { id: savingToast });
      const saved = await resumeService.saveTailoredVersion({
        candidateId: tailorCandId,
        createdBy,
        versionName: `${tailorResult.suggestedTitle || 'Tailored'} v${tailorCandResumes.length + 1}`,
        versionNumber: tailorCandResumes.length + 1,
        jobTitle: tailorResult.suggestedTitle || '',
        summary: tailorResult.optimizedSummary || '',
        skills: tailorResult.optimizedSkills || [],
        rawText,
        docxBlob,
        pdfBlob: docPreview.pdfBlob,
        addedKeywords: tailorResult.addedKeywords || [],
        matchScoreBefore: tailorResult.matchScoreBefore,
        matchScoreAfter: tailorResult.matchScoreAfter,
        jdSnapshot: jd,
      });

      const hasFiles = saved.docx_file_url || saved.pdf_file_url;
      toast.success(
        hasFiles ? 'Tailored resume saved (text + files)' : 'Tailored resume saved (text only — file upload failed)',
        { id: savingToast },
      );

      setTailorMode(false);
      setTailorStep('setup');
      setTailorResult(null);
      setEditableTailoredText('');
      setEditMode(false);
      setJd('');
      invalidate.resumes();
      invalidate.candidates();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast.error(message, { id: savingToast });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadFilePick = async (file: File | null) => {
    if (!file) {
      setUploadFile(null);
      return;
    }
    if (!isResumeFile(file)) {
      toast.error('Only PDF and DOCX files are supported.');
      return;
    }
    setUploadFile(file);
    setIsParsingUpload(true);
    try {
      const extracted = await extractResumeContent(file);
      const candName = candidates.find((c) => c.id === uploadCandId)?.full_name ?? '';
      let docxParagraphs: string[] | undefined;
      if (file.name.toLowerCase().endsWith('.docx')) {
        docxParagraphs = await extractDocxParagraphTexts(await file.arrayBuffer());
      }
      const immutableText = pickImmutableSourceText(
        extracted.plainText,
        extracted.plainText,
        docxParagraphs,
        candName || undefined,
      );
      setUploadText(immutableText);
      toast.success('Resume text extracted — ready for AI tailoring.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not read resume file.');
      setUploadFile(null);
      setUploadText('');
    } finally {
      setIsParsingUpload(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadCandId) { toast.error("Select a candidate"); return; }
    if (!uploadFile) { toast.error("Upload a PDF or DOCX resume"); return; }
    if (!uploadText.trim()) { toast.error("Could not extract text from file — try another resume"); return; }
    setIsUploading(true);
    try {
      const { pdfUrl, docxUrl } = await uploadResumeFile(uploadCandId, uploadFile);

      const cResumes = resumes.filter(r => r.candidate_id === uploadCandId);
      await resumeService.create({
        candidate_id: uploadCandId,
        version_name: uploadVersionName || 'Base Resume v1',
        version_number: cResumes.length + 1,
        type: 'base',
        job_title: candidates.find(c => c.id === uploadCandId)?.target_roles?.[0] || '',
        summary: uploadText.slice(0, 500),
        skills: candidates.find(c => c.id === uploadCandId)?.skills || [],
        experience: [],
        raw_text: uploadText.trim(),
        pdf_file_url: pdfUrl,
        docx_file_url: docxUrl,
        is_active: true,
        created_by: user?.id || '',
      });
      toast.success("Resume uploaded successfully");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadText('');
      setUploadCandId('');
      setUploadVersionName('Base Resume v1');
      invalidate.resumes();
      invalidate.candidates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  // ─── TAILOR SPLIT-SCREEN MODE ────────────────────────────────────────────────
  if (tailorMode) {
    const originalText = resumeTextForTailor;
    const hasPdf = !!tailorBaseResume?.pdf_file_url;
    const hasDocx = !!tailorBaseResume?.docx_file_url;
    const resumeTextReady = originalText.length > 0;
    const showLiveJdPreview = tailorStep === 'setup';
    const isAiWorking = tailorStep === 'processing' || tailorStep === 'revealing';
    const resultHighlightNeedles =
      tailorResult?.sectionChanges.map((c) => c.tailored).filter(Boolean) ?? liveReveal.highlightNeedles;

    return (
      <div className="flex h-[calc(100vh-7rem)] -m-4 sm:-m-6 lg:-m-8 overflow-hidden flex-col">

        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { liveReveal.cancel(); setTailorMode(false); setTailorStep('setup'); setTailorResult(null); setEditableTailoredText(""); setEditMode(false); setJd(''); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-sm font-bold text-foreground">AI Resume Tailor</h2>
            <p className="text-[11px] text-muted-foreground">Left = your upload · Right = same layout with AI edits (matches Word when DOCX)</p>
          </div>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            tailorStep === 'setup' ? 'bg-muted text-muted-foreground' :
            tailorStep === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
            tailorStep === 'revealing' ? 'bg-teal-500/20 text-teal-400 animate-pulse' :
            'bg-teal-500/20 text-teal-400'
          }`}>
            {tailorStep === 'setup' ? 'Setup' : tailorStep === 'processing' ? 'Thinking…' : tailorStep === 'revealing' ? 'Editing live' : 'Complete'}
          </span>
          {tailorStep === 'result' && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => downloadTailored('pdf')} disabled={!docPreview.isPdfReady}>
                <Download className="w-3 h-3 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => downloadTailored('docx')} disabled={!docPreview.isDocxReady}>
                <Download className="w-3 h-3 mr-1" /> DOCX
              </Button>
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="text-xs h-8"
                onClick={() => setEditMode(v => !v)}
              >
                {editMode ? "Preview only" : "Edit & preview"}
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setTailorStep('setup'); setTailorResult(null); setEditableTailoredText(""); setEditMode(false); }}>
                <RotateCcw className="w-3 h-3 mr-1" /> Re-run
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-primary"
                onClick={handleSaveTailored}
                disabled={isSaving || !tailoredTextForPreview.trim()}
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}
                {isSaving ? 'Saving…' : 'Save Version'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Controls sidebar */}
          <div className="w-[340px] flex-shrink-0 flex flex-col bg-card border-r border-border overflow-y-auto">
            <div className="flex-1 p-4 space-y-4">
              {tailorStep === 'setup' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Candidate</Label>
                    <Select value={tailorCandId} onValueChange={setTailorCandId}>
                      <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Choose candidate…" /></SelectTrigger>
                      <SelectContent>
                        {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {tailorCandId && tailorCandResumes.length > 1 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resume Version</Label>
                      <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                        <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select resume…" /></SelectTrigger>
                        <SelectContent>
                          {tailorCandResumes.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.version_name} ({r.type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {tailorCandId && !tailorBaseResume && (
                    <p className="text-[11px] text-yellow-400 bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                      No resume found. Upload a PDF or DOCX first.
                    </p>
                  )}
                  {tailorCandId && tailorBaseResume && !resumeTextReady && (
                    <p className="text-[11px] text-yellow-400 bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                      Resume has no extracted text. Re-upload the PDF or DOCX file.
                    </p>
                  )}
                  {resumeTextReady && (
                    <p className="text-[11px] text-teal-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {originalText.length} chars · {hasPdf ? 'PDF' : hasDocx ? 'DOCX' : 'text'} on file
                    </p>
                  )}

                  {jdLivePreview && jd.trim() && (
                    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">ATS keyword match</span>
                        <span className={`text-lg font-bold ${jdLivePreview.score >= 60 ? 'text-teal-400' : jdLivePreview.score >= 40 ? 'text-yellow-400' : 'text-destructive'}`}>
                          {jdLivePreview.totalKeywords > 0 ? `${jdLivePreview.score}%` : '—'}
                        </span>
                      </div>

                      {jdLivePreview.impactMatched.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-amber-400 mb-1">High-impact matched</p>
                          <div className="flex flex-wrap gap-1">
                            {jdLivePreview.impactMatched.slice(0, 10).map((k) => (
                              <span key={k} className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-200 border border-amber-500/30">{k}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {jdLivePreview.impactMissing.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-red-400 mb-1">High-impact missing — add these</p>
                          <div className="flex flex-wrap gap-1">
                            {jdLivePreview.impactMissing.slice(0, 8).map((k) => (
                              <span key={k} className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-300 border border-red-500/25">{k}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {jdLivePreview.mustHaveMissing.length > 0 && (
                        <p className="text-[10px] text-yellow-400">
                          Required gaps: {jdLivePreview.mustHaveMissing.slice(0, 5).join(', ')}
                        </p>
                      )}

                      <div className="border-t border-border pt-2 space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Recruiter tips</p>
                        {jdLivePreview.recruiterTips.map((tip, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground leading-snug">• {tip}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job Description</Label>
                    <Textarea
                      placeholder="Paste the full job description… (right panel updates as you type)"
                      className="min-h-[180px] text-xs bg-background font-mono resize-none"
                      value={jd}
                      onChange={e => setJd(e.target.value)}
                    />
                  </div>

                  <Button
                    className="w-full bg-primary text-primary-foreground"
                    onClick={handleTailor}
                    disabled={!tailorCandId || !jd.trim() || !resumeTextReady || aiPending}
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> Analyze & Tailor
                  </Button>
                </>
              )}

              {tailorStep === 'processing' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground font-medium">Progress</span>
                      <span className="text-primary font-bold">{analysisProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${analysisProgress}%` }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-teal-400 italic">
                    {liveReveal.thinkingMessage || aiStatus || 'AI is thinking… watch the bubble on your resume →'}
                  </p>
                  <div className="space-y-2">
                    {ANALYSIS_STEPS.slice(0, analysisStep + 1).map((step, i) => (
                      <div key={i} className={`flex items-start gap-2 text-[12px] ${i === analysisStep ? 'opacity-100' : 'opacity-50'}`}>
                        {i < analysisStep ? <CheckCircle className="w-3.5 h-3.5 text-teal-400 mt-0.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-primary mt-0.5" />}
                        <span>{step.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tailorStep === 'revealing' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-teal-400 font-medium">Applying edits one by one — {liveReveal.appliedChanges.length} done</p>
                  <p className="text-[11px] text-muted-foreground italic">{liveReveal.thinkingMessage}</p>
                </div>
              )}

              {tailorStep === 'result' && tailorResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-background rounded-lg border border-border p-2 text-center">
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">Before</div>
                      <div className="text-2xl font-display font-bold text-destructive">{tailorResult.matchScoreBefore}%</div>
                    </div>
                    <div className="bg-background rounded-lg border border-primary/30 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">After</div>
                      <div className="text-2xl font-display font-bold text-primary">{tailorResult.matchScoreAfter}%</div>
                    </div>
                  </div>

                  {tailorResult.suggestedTitle && (
                    <div className="bg-teal-500/10 border border-teal-500/20 rounded p-2">
                      <span className="text-[10px] uppercase font-bold text-teal-400">Suggested Title</span>
                      <p className="text-sm font-semibold mt-0.5">{tailorResult.suggestedTitle}</p>
                    </div>
                  )}

                  {tailorResult.sectionChanges?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">
                        Edits ({tailorResult.sectionChanges.length})
                      </p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {tailorResult.sectionChanges.map((c, i) => (
                          <div key={i} className="text-[11px] bg-background border border-border rounded p-2 space-y-1">
                            <p className="font-semibold text-muted-foreground">{c.label}</p>
                            <p className="text-destructive/80 line-through opacity-70">{c.original?.slice(0, 100)}{c.original?.length > 100 ? '…' : ''}</p>
                            <p className="text-teal-400">{c.tailored?.slice(0, 100)}{c.tailored?.length > 100 ? '…' : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tailorResult.addedKeywords?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase font-bold text-teal-400 mb-1">Keywords AI will add</p>
                      <div className="flex flex-wrap gap-1">
                        {tailorResult.addedKeywords.slice(0, 12).map((k) => (
                          <span key={k} className="px-1.5 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-200 border border-teal-500/30">{k}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {tailorResult.atsWarnings?.length > 0 && (
                    <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-300 space-y-1">
                      {tailorResult.atsWarnings.map((w, i) => (
                        <p key={i}>⚠ {w}</p>
                      ))}
                    </div>
                  )}

                  {tailorResult.overallFeedback && (
                    <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                      {tailorResult.overallFeedback}
                    </div>
                  )}

                  {tailorResult.tailoringSummary && (
                    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Tailoring summary</p>
                      {tailorResult.tailoringSummary.jdTitle && (
                        <p className="text-[11px] text-foreground">
                          <span className="text-muted-foreground">Target role (kept out of skills/bullets): </span>
                          {tailorResult.tailoringSummary.jdTitle}
                        </p>
                      )}
                      {tailorResult.tailoringSummary.sectionsUpdated.length > 0 && (
                        <p className="text-[11px] text-foreground">
                          <span className="text-muted-foreground">Updated: </span>
                          {tailorResult.tailoringSummary.sectionsUpdated.join(', ')}
                        </p>
                      )}
                      {tailorResult.tailoringSummary.skillsPreserved.length > 0 && (
                        <p className="text-[11px] text-foreground">
                          <span className="text-muted-foreground">Skill categories kept: </span>
                          {tailorResult.tailoringSummary.skillsPreserved.join(', ')}
                        </p>
                      )}
                      {tailorResult.tailoringSummary.unsupportedNotAdded.length > 0 && (
                        <p className="text-[11px] text-yellow-300">
                          <span className="text-muted-foreground">Not added (unsupported): </span>
                          {tailorResult.tailoringSummary.unsupportedNotAdded.slice(0, 8).join(', ')}
                        </p>
                      )}
                      <div className="border-t border-border pt-2 space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">
                          Structure validation {tailorResult.tailoringSummary.validation.passed ? '✓' : '— trimmed'}
                        </p>
                        {tailorResult.tailoringSummary.validation.checks.map((c) => (
                          <p key={c.id} className={`text-[10px] ${c.passed ? 'text-teal-400' : 'text-yellow-400'}`}>
                            {c.passed ? '✓' : '○'} {c.label}{c.detail ? ` (${c.detail})` : ''}
                          </p>
                        ))}
                      </div>
                      {hasDocx && docPreview.docxSummaryValidation && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">
                            DOCX summary {docPreview.docxSummaryValidation.passed ? '✓' : '— not applied'}
                          </p>
                          <p className={`text-[10px] ${docPreview.docxSummaryValidation.passed ? 'text-teal-400' : 'text-yellow-400'}`}>
                            {docPreview.docxSummaryValidation.passed ? '✓' : '○'} {docPreview.docxSummaryValidation.detail}
                          </p>
                        </div>
                      )}
                      {hasDocx && docPreview.docxTitleValidation && tailorResult?.suggestedTitle?.trim() && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">
                            DOCX header {docPreview.docxTitleValidation.passed ? '✓' : '— not applied'}
                          </p>
                          <p className={`text-[10px] ${docPreview.docxTitleValidation.passed ? 'text-teal-400' : 'text-yellow-400'}`}>
                            {docPreview.docxTitleValidation.passed ? '✓' : '○'} {docPreview.docxTitleValidation.detail}
                          </p>
                          {!docPreview.docxTitleValidation.passed && (
                            <p className="text-[10px] text-muted-foreground">
                              title {docPreview.docxTitleValidation.hasTitleLine ? '✓' : '○'} ({docPreview.docxTitleValidation.titleLineCount ?? 0} lines) · block {docPreview.docxTitleValidation.headerBlockExact ? '✓' : '○'} · name first {docPreview.docxTitleValidation.nameFirst !== false ? '✓' : '○'} · location {docPreview.docxTitleValidation.hasLocation ? '✓' : '○'} · contact {docPreview.docxTitleValidation.hasContactLine ? '✓' : '○'} ({docPreview.docxTitleValidation.contactLineCount ?? 0} lines) · old title {docPreview.docxTitleValidation.oldTitleLeaked ? '○ leaked' : '✓'} · dup title {docPreview.docxTitleValidation.titleDuplicated ? '○' : '✓'} · extra lines {docPreview.docxTitleValidation.headerExtraLines === 0 ? '✓' : docPreview.docxTitleValidation.headerExtraLines} · certs {docPreview.docxTitleValidation.certsPreserved ? '✓' : '○'} · empty bullets {docPreview.docxTitleValidation.emptyBulletCount === 0 ? '✓' : docPreview.docxTitleValidation.emptyBulletCount}
                            </p>
                          )}
                        </div>
                      )}
                      {hasDocx &&
                        docPreview.docxSkillsValidation &&
                        tailorResult?.tailoringSummary?.sectionsUpdated.some((s) => /skill/i.test(s)) && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">
                            DOCX skills {docPreview.docxSkillsValidation.passed ? '✓' : '— not applied'}
                          </p>
                          <p className={`text-[10px] ${docPreview.docxSkillsValidation.passed ? 'text-teal-400' : 'text-yellow-400'}`}>
                            {docPreview.docxSkillsValidation.passed ? '✓' : '○'} {docPreview.docxSkillsValidation.detail}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => downloadTailored('pdf')} disabled={!docPreview.isPdfReady}>
                      <Download className="w-3 h-3 mr-1" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => downloadTailored('docx')} disabled={!docPreview.isDocxReady}>
                      <Download className="w-3 h-3 mr-1" /> DOCX
                    </Button>
                  </div>
                  {hasDocx && (
                    <p className="text-[10px] text-muted-foreground">DOCX is patched from your uploaded file when possible.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Side-by-side document panels */}
          <div className="flex-1 flex min-w-0 bg-gray-200">
            {!tailorCandId ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Select a candidate to preview their resume
              </div>
            ) : !tailorBaseResume ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-8 text-center">
                No resume on file — upload a PDF or DOCX first
              </div>
            ) : (
              <>
                {/* LEFT: exact uploaded file */}
                <div className="flex-1 min-w-0 flex flex-col border-r border-gray-300 bg-white shadow-inner">
                  {hasDocx && sourceDocxHtml ? (
                    <ResumeHtmlPreview html={sourceDocxHtml} label="Original (uploaded DOCX)" />
                  ) : hasPdf ? (
                    <ResumePdfPreview url={tailorBaseResume.pdf_file_url!} label="Original (uploaded PDF)" />
                  ) : (
                    <FaithfulResumeView
                      text={originalText || "No text extracted — re-upload PDF or DOCX."}
                      label="Original Resume"
                    />
                  )}
                </div>

                {/* RIGHT: same format as upload — DOCX HTML from patched file, or faithful lines for PDF */}
                <div className="flex-1 min-w-0 flex flex-col bg-white shadow-inner relative">
                  {showLiveJdPreview && !sourceDocx && (
                    <FaithfulResumeView
                      text={originalText}
                      label="Live JD match (updates as you type)"
                      highlightNeedles={jdHighlightNeedles}
                    />
                  )}

                  {showLiveJdPreview && sourceDocx && sourceDocxHtml && (
                    <ResumeHtmlPreview html={sourceDocxHtml} label="Live JD match — your Word layout" />
                  )}

                  {isAiWorking && sourceDocx && tailorStep === 'processing' && (
                    <div className="relative flex-1 min-h-0">
                      <ResumeHtmlPreview
                        html={sourceDocxHtml}
                        label="AI thinking… (your Word layout)"
                        emptyMessage="Loading…"
                      />
                      {liveReveal.thinkingMessage && (
                        <AiThinkingBubble message={liveReveal.thinkingMessage} />
                      )}
                    </div>
                  )}

                  {isAiWorking && sourceDocx && tailorStep === 'revealing' && (
                    <div className="relative flex-1 min-h-0">
                      <FaithfulResumeView
                        text={liveReveal.liveText || resumeTextForTailor}
                        label="AI editing live"
                        highlightNeedles={liveReveal.highlightNeedles}
                        pendingChange={liveReveal.pendingChange}
                        thinkingMessage={liveReveal.thinkingMessage}
                        showCursor={!!liveReveal.pendingChange}
                      />
                    </div>
                  )}

                  {isAiWorking && !sourceDocx && (
                    <FaithfulResumeView
                      text={liveReveal.liveText || originalText}
                      label={tailorStep === 'processing' ? 'AI thinking…' : 'AI editing live'}
                      highlightNeedles={liveReveal.highlightNeedles}
                      pendingChange={liveReveal.pendingChange}
                      thinkingMessage={liveReveal.thinkingMessage}
                      showCursor={tailorStep === 'processing' || !!liveReveal.pendingChange}
                    />
                  )}

                  {tailorStep === 'result' && editMode && (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider shrink-0">
                        Edit text — download keeps your uploaded layout
                      </div>
                      <Textarea
                        className="flex-1 min-h-0 rounded-none border-0 font-['Times_New_Roman',serif] text-[13px] leading-relaxed p-6 resize-none focus-visible:ring-0 bg-white text-neutral-900 placeholder:text-neutral-400"
                        style={{ color: '#171717' }}
                        value={editableTailoredText}
                        onChange={e => setEditableTailoredText(e.target.value)}
                      />
                    </div>
                  )}

                  {tailorStep === 'result' && !editMode && sourceDocx && (
                    <ResumeHtmlPreview
                      html={tailoredDocxHtml}
                      label="Tailored resume (matches Word download)"
                      emptyMessage={docPreview.isDocxReady ? 'Loading preview…' : 'Building Word preview…'}
                    />
                  )}

                  {tailorStep === 'result' && !editMode && !sourceDocx && (
                    <FaithfulResumeView
                      text={tailoredTextForPreview}
                      label="Tailored resume"
                      highlightNeedles={resultHighlightNeedles}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── NORMAL GRID VIEW ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Resume Database</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-56">
            <Select value={candidateFilter} onValueChange={setCandidateFilter}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Candidates" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Candidates</SelectItem>
                {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select
              value={versionFilter}
              onValueChange={(v) => {
                setVersionFilter(v);
                if (v !== "custom") setCustomVersion("");
              }}
            >
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Versions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Versions</SelectItem>
                <SelectItem value="base">Base</SelectItem>
                {availableVersions.map((n) => (
                  <SelectItem key={n} value={`v${n}`}>V{n}</SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {versionFilter === "custom" && (
            <div className="w-48">
              <Input
                autoFocus
                value={customVersion}
                onChange={(e) => setCustomVersion(e.target.value)}
                placeholder="Type a version…"
                className="bg-card border-border"
              />
            </div>
          )}

          {/* Upload Dialog */}
          <Dialog open={uploadOpen} onOpenChange={v => { setUploadOpen(v); if (!v) { setUploadFile(null); setUploadText(''); setUploadCandId(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border">
                <Upload className="w-4 h-4 mr-2" /> Upload Resume
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-card border-border">
              <DialogHeader>
                <DialogTitle>Upload Resume</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Candidate</Label>
                  <Select value={uploadCandId} onValueChange={setUploadCandId}>
                    <SelectTrigger><SelectValue placeholder="Select candidate…" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Version Name</Label>
                  <Input value={uploadVersionName} onChange={e => setUploadVersionName(e.target.value)} placeholder="Base Resume v1" />
                </div>
                <div className="space-y-2">
                  <Label>Resume File <span className="text-muted-foreground text-xs font-normal">(PDF or DOCX — text extracted automatically)</span></Label>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => document.getElementById('resume-file-input')?.click()}
                  >
                    {isParsingUpload ? (
                      <Loader2 className="w-6 h-6 text-primary mx-auto mb-2 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    )}
                    {uploadFile ? (
                      <p className="text-sm font-medium text-primary">{uploadFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to choose PDF or DOCX</p>
                    )}
                    <input
                      id="resume-file-input"
                      type="file"
                      accept={resumeFileAccept()}
                      className="hidden"
                      onChange={e => handleUploadFilePick(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>
                {uploadText.length > 0 && (
                  <p className="text-[11px] text-teal-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {uploadText.length} characters extracted for AI tailoring
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpload} disabled={isUploading || isParsingUpload || !uploadFile} className="bg-primary text-primary-foreground">
                    {isUploading ? "Uploading…" : "Upload Resume"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            className="bg-primary text-primary-foreground"
            onClick={() => setTailorMode(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" /> AI Tailor
          </Button>
        </div>
      </div>

      <FetchingHint show={ready && isFetching && isFetched} />

      {!ready || isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 bg-muted/50 animate-pulse rounded-xl border border-border" />)}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} label="Failed to load resumes" />
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-xl border border-border py-16 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No resumes found</h3>
          <p className="text-muted-foreground text-sm mb-4">Upload a base resume from a candidate profile to get started.</p>
          <Button onClick={() => setUploadOpen(true)} variant="outline"><Upload className="w-4 h-4 mr-2" />Upload Resume</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredData.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5 card-hover flex flex-col group hover:border-primary/30 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground text-base leading-tight truncate pr-2" title={resumeCandidateName(r.candidates)}>
                    {resumeCandidateName(r.candidates)}
                  </h3>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.version_name}</div>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider shrink-0 ${
                  r.type === 'base' ? 'bg-teal-500/20 text-teal-400' :
                  r.type === 'tailored' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>{r.type}</span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded border border-border">v{r.version_number}</span>
                <span className="text-xs text-muted-foreground truncate">{r.job_title}</span>
              </div>

              {r.raw_text && (
                <div className="mb-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-teal-400 bg-teal-500/10 rounded px-1.5 py-0.5 border border-teal-500/20">
                    <CheckCircle className="w-2.5 h-2.5" /> Text available for AI
                  </span>
                </div>
              )}

              {r.type === 'tailored' && r.match_score_after && (
                <div className="mb-3 bg-background/50 rounded-md border border-border p-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase font-bold text-[10px]">ATS Match</span>
                  <div className="flex items-center gap-1.5">
                    <span className="line-through text-muted-foreground">{r.match_score_before}%</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <span className="font-bold text-primary">{r.match_score_after}%</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mb-3 flex-1 items-start content-start">
                {r.skills?.slice(0, 4).map((s: string) => (
                  <span key={s} className="px-1.5 py-0.5 bg-background rounded text-[10px] text-muted-foreground border border-border">{s}</span>
                ))}
                {(r.skills?.length || 0) > 4 && <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">+{r.skills.length - 4}</span>}
              </div>

              <div className="flex gap-2 pt-3 border-t border-border mt-auto opacity-60 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border" disabled={!r.pdf_file_url} asChild={!!r.pdf_file_url}>
                  {r.pdf_file_url ? <a href={r.pdf_file_url} target="_blank" rel="noopener noreferrer" download><Download className="w-3 h-3 mr-1.5" />PDF</a> : <><Download className="w-3 h-3 mr-1.5" />PDF</>}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border" disabled={!r.docx_file_url} asChild={!!r.docx_file_url}>
                  {r.docx_file_url ? <a href={r.docx_file_url} target="_blank" rel="noopener noreferrer" download><Download className="w-3 h-3 mr-1.5" />DOCX</a> : <><Download className="w-3 h-3 mr-1.5" />DOCX</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
