import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/dbError";
import { resumeService } from "@/services/resumeService";
import { candidateService } from "@/services/candidateService";
import { aiTailorResume } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Download, ArrowRight, Sparkles, Upload, ChevronLeft, CheckCircle, AlertCircle, RotateCcw, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";

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

function diffLines(original: string, tailored: string): Array<{ text: string; changed: boolean }> {
  const origLines = original.split('\n');
  const tailLines = tailored.split('\n');
  const maxLen = Math.max(origLines.length, tailLines.length);
  const result: Array<{ text: string; changed: boolean }> = [];
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i] ?? '';
    const t = tailLines[i] ?? '';
    result.push({ text: t || o, changed: t.trim() !== o.trim() && t.trim() !== '' });
  }
  return result;
}

function ResumeDocument({ text, tailoredText, isProcessing, showDiff }: {
  text: string;
  tailoredText?: string;
  isProcessing?: boolean;
  showDiff?: boolean;
}) {
  const lines = showDiff && tailoredText
    ? diffLines(text, tailoredText)
    : text.split('\n').map(l => ({ text: l, changed: false }));

  const renderLine = (line: { text: string; changed: boolean }, idx: number) => {
    const t = line.text;
    const isBlank = t.trim() === '';
    const isAllCaps = t.trim().length > 2 && t.trim() === t.trim().toUpperCase() && /[A-Z]/.test(t);
    const isBullet = /^\s*[•\-–*]\s/.test(t) || /^\s{2,}/.test(t);
    const isContact = idx < 4 && (t.includes('@') || t.includes('|') || t.includes('linkedin'));
    const isName = idx === 0 && t.trim().length > 0;

    if (isBlank) return <div key={idx} className="h-2" />;

    let className = "text-gray-700 text-[13px] leading-relaxed";
    if (isName) className = "text-gray-900 text-xl font-bold mb-0.5";
    else if (isContact) className = "text-gray-500 text-[11px]";
    else if (isAllCaps) className = "text-gray-900 text-[12px] font-bold uppercase tracking-widest border-b border-gray-300 pb-0.5 mt-3 mb-1";
    else if (isBullet) className = "text-gray-700 text-[12px] leading-relaxed pl-4";

    const highlight = line.changed && showDiff
      ? "bg-teal-100 border-l-2 border-teal-400 pl-1 rounded-sm text-teal-900"
      : "";

    return (
      <div key={idx} className={`${className} ${highlight} transition-colors duration-500`}>
        {t}
      </div>
    );
  };

  return (
    <div className="relative">
      {isProcessing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] rounded">
          <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin mb-3" />
          <p className="text-xs text-gray-500 font-medium">Analyzing…</p>
        </div>
      )}
      <div className={`space-y-[2px] transition-opacity duration-300 ${isProcessing ? 'opacity-40' : 'opacity-100'}`}>
        {lines.map((line, idx) => renderLine(line, idx))}
      </div>
    </div>
  );
}

export default function ResumesPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [candidateFilter, setCandidateFilter] = useState("all");

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCandId, setUploadCandId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadVersionName, setUploadVersionName] = useState("Base Resume v1");
  const [isUploading, setIsUploading] = useState(false);

  // Tailor mode
  const [tailorMode, setTailorMode] = useState(false);
  const [tailorStep, setTailorStep] = useState<'setup' | 'processing' | 'result'>('setup');
  const [tailorCandId, setTailorCandId] = useState("");
  const [jd, setJd] = useState("");
  const [tailorResult, setTailorResult] = useState<any>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Selected resume for preview
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        supabase.from('resumes').select('*, candidates(full_name)').order('created_at', { ascending: false }),
        candidateService.getAll(),
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

  useEffect(() => { loadAll(); }, []);

  // Cleanup interval on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const filteredData = candidateFilter === "all" ? data : data.filter(r => r.candidate_id === candidateFilter);
  const previewResume = data.find(r => r.id === previewResumeId);

  // Current tailor candidate's base resume
  const tailorCandResumes = data.filter(r => r.candidate_id === tailorCandId);
  const tailorBaseResume = tailorCandResumes.find(r => r.type === 'base') || tailorCandResumes[0];
  const tailorCandName = candidates.find(c => c.id === tailorCandId)?.full_name || '';

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
    if (!tailorCandId) { toast.error("Select a candidate"); return; }
    if (!jd.trim()) { toast.error("Paste a job description"); return; }
    if (!tailorBaseResume?.raw_text && !tailorBaseResume?.summary) {
      toast.error("This candidate has no resume text. Upload a resume with pasted text first."); return;
    }
    setTailorStep('processing');
    startAnalysisAnimation();
    try {
      const resumeText = tailorBaseResume.raw_text || tailorBaseResume.summary;
      const res = await aiTailorResume(resumeText, jd, tailorCandName);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setAnalysisProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setTailorResult(res);
      setTailorStep('result');
    } catch (err: any) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      toast.error(err.message || "Tailoring failed");
      setTailorStep('setup');
    }
  };

  const handleSaveTailored = async () => {
    if (!tailorCandId || !tailorResult) return;
    try {
      await resumeService.create({
        candidate_id: tailorCandId,
        version_name: `${tailorResult.suggestedTitle || 'Tailored'} v${tailorCandResumes.length + 1}`,
        version_number: tailorCandResumes.length + 1,
        type: 'tailored',
        job_title: tailorResult.suggestedTitle || '',
        summary: tailorResult.optimizedSummary || '',
        skills: tailorResult.optimizedSkills || [],
        experience: [],
        raw_text: tailorResult.tailoredResumeText || '',
        added_keywords: tailorResult.addedKeywords || [],
        match_score_before: tailorResult.matchScoreBefore,
        match_score_after: tailorResult.matchScoreAfter,
        jd_snapshot: jd,
        is_active: false,
        created_by: user?.id || '',
      });
      toast.success("Tailored resume saved");
      setTailorMode(false);
      setTailorStep('setup');
      setTailorResult(null);
      setJd('');
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleUpload = async () => {
    if (!uploadCandId) { toast.error("Select a candidate"); return; }
    if (!uploadFile && !uploadText.trim()) { toast.error("Provide a file or paste resume text"); return; }
    setIsUploading(true);
    try {
      let pdfUrl: string | undefined;
      let docxUrl: string | undefined;
      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop()?.toLowerCase();
        const path = `${uploadCandId}/${Date.now()}-${uploadFile.name}`;
        const { data: storageData, error: storageErr } = await supabase.storage
          .from('resumes')
          .upload(path, uploadFile, { cacheControl: '3600', upsert: false });
        if (storageErr) {
          if (storageErr.message?.includes('Bucket not found') || storageErr.message?.includes('does not exist')) {
            toast.error("Storage bucket 'resumes' not found. Create it in Supabase Storage first (Settings → Storage → New Bucket → name: resumes → Public: ON).");
            setIsUploading(false);
            return;
          }
          throw storageErr;
        }
        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(storageData.path);
        if (ext === 'pdf') pdfUrl = publicUrl;
        if (ext === 'docx' || ext === 'doc') docxUrl = publicUrl;
      }

      let rawText = uploadText.trim();
      if (!rawText && uploadFile && uploadFile.type === 'text/plain') {
        rawText = await uploadFile.text();
      }

      const cResumes = data.filter(r => r.candidate_id === uploadCandId);
      await resumeService.create({
        candidate_id: uploadCandId,
        version_name: uploadVersionName || 'Base Resume v1',
        version_number: cResumes.length + 1,
        type: 'base',
        job_title: candidates.find(c => c.id === uploadCandId)?.target_roles?.[0] || '',
        summary: rawText.slice(0, 500),
        skills: candidates.find(c => c.id === uploadCandId)?.skills || [],
        experience: [],
        raw_text: rawText,
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
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  // ─── TAILOR SPLIT-SCREEN MODE ────────────────────────────────────────────────
  if (tailorMode) {
    const originalText = tailorBaseResume?.raw_text || tailorBaseResume?.summary || '';
    const tailoredText = tailorResult?.tailoredResumeText || '';
    const showDiff = tailorStep === 'result' && !!tailoredText;

    return (
      <div className="flex h-[calc(100vh-7rem)] -m-4 sm:-m-6 lg:-m-8 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-[400px] flex-shrink-0 flex flex-col bg-card border-r border-border overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTailorMode(false); setTailorStep('setup'); setTailorResult(null); setJd(''); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-sm font-bold text-foreground">AI Resume Tailor</h2>
              <p className="text-[11px] text-muted-foreground">Text-only optimization · Structure preserved</p>
            </div>
            <div className="ml-auto">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                tailorStep === 'setup' ? 'bg-muted text-muted-foreground' :
                tailorStep === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-teal-500/20 text-teal-400'
              }`}>
                {tailorStep === 'setup' ? 'Setup' : tailorStep === 'processing' ? 'Analyzing' : 'Complete'}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 space-y-5">
            {/* STEP 1: SETUP */}
            {tailorStep === 'setup' && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Select Candidate</Label>
                  <Select value={tailorCandId} onValueChange={setTailorCandId}>
                    <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Choose candidate…" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {tailorCandId && !tailorBaseResume && (
                    <p className="text-[11px] text-yellow-400 bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                      ⚠ No resume found for this candidate. Upload one first.
                    </p>
                  )}
                  {tailorCandId && tailorBaseResume && !tailorBaseResume.raw_text && !tailorBaseResume.summary && (
                    <p className="text-[11px] text-yellow-400 bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                      ⚠ Resume has no text content. Re-upload with text pasted in.
                    </p>
                  )}
                  {tailorCandId && tailorBaseResume?.raw_text && (
                    <p className="text-[11px] text-teal-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Resume text loaded — {tailorBaseResume.raw_text.length} chars
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2. Paste Job Description</Label>
                  <Textarea
                    placeholder="Paste the full job description here — include requirements, responsibilities, and qualifications for best results…"
                    className="min-h-[220px] text-xs bg-background font-mono resize-none"
                    value={jd}
                    onChange={e => setJd(e.target.value)}
                  />
                  {jd.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">{jd.length} chars · {jd.split(/\s+/).length} words</p>
                  )}
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5 text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground text-xs">What the AI will do:</p>
                  <p>• Rephrase bullet points to weave in missing keywords naturally</p>
                  <p>• Rewrite the professional summary to match the target role</p>
                  <p>• Adjust the skills section for ATS keyword matching</p>
                  <p className="text-yellow-400">• Will NOT change structure, dates, company names, or bullet count</p>
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground"
                  onClick={handleTailor}
                  disabled={!tailorCandId || !jd.trim() || !tailorBaseResume?.raw_text}
                >
                  <Sparkles className="w-4 h-4 mr-2" /> Analyze & Tailor Resume
                </Button>
              </>
            )}

            {/* STEP 2: PROCESSING */}
            {tailorStep === 'processing' && (
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground font-medium">Analysis progress</span>
                    <span className="text-primary font-bold">{analysisProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-700"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {ANALYSIS_STEPS.slice(0, analysisStep + 1).map((step, i) => (
                    <div key={i} className={`flex items-start gap-2.5 text-[12px] transition-opacity duration-500 ${i === analysisStep ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center ${i < analysisStep ? 'bg-teal-500/20' : i === analysisStep ? 'border border-primary' : 'bg-muted'}`}>
                        {i < analysisStep && <CheckCircle className="w-3 h-3 text-teal-400" />}
                        {i === analysisStep && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                      </div>
                      <span className={i === analysisStep ? 'text-foreground font-medium' : 'text-muted-foreground'}>{step.msg}</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400">
                  <p className="font-semibold mb-1">Live preview on the right</p>
                  <p>The resume document will update with highlighted changes once analysis is complete.</p>
                </div>
              </div>
            )}

            {/* STEP 3: RESULT */}
            {tailorStep === 'result' && tailorResult && (
              <div className="space-y-4">
                {/* Score */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-background rounded-lg border border-border p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Before</div>
                    <div className="text-3xl font-display font-bold text-destructive">{tailorResult.matchScoreBefore}%</div>
                    <div className="text-[10px] text-muted-foreground">ATS Match</div>
                  </div>
                  <div className="bg-background rounded-lg border border-primary/30 p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">After</div>
                    <div className="text-3xl font-display font-bold text-primary">{tailorResult.matchScoreAfter}%</div>
                    <div className="text-[10px] text-muted-foreground">ATS Match</div>
                  </div>
                </div>

                {/* Suggested title */}
                {tailorResult.suggestedTitle && (
                  <div className="bg-teal-500/10 border border-teal-500/20 rounded-md p-2.5">
                    <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Suggested Title</span>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{tailorResult.suggestedTitle}</p>
                  </div>
                )}

                {/* Keywords */}
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-destructive tracking-wider mb-1.5">Identified Missing</p>
                    <div className="flex flex-wrap gap-1">
                      {tailorResult.missingKeywords?.map((k: string) => (
                        <span key={k} className="px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px] rounded border border-destructive/20">{k}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-teal-400 tracking-wider mb-1.5">Added to Resume</p>
                    <div className="flex flex-wrap gap-1">
                      {tailorResult.addedKeywords?.map((k: string) => (
                        <span key={k} className="px-1.5 py-0.5 bg-teal-500/10 text-teal-400 text-[10px] rounded border border-teal-500/20">{k}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Changes summary */}
                {tailorResult.sectionChanges?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Changes Made ({tailorResult.sectionChanges.length})</p>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {tailorResult.sectionChanges.map((c: any, i: number) => (
                        <div key={i} className="text-[11px] bg-background border border-border rounded p-2">
                          <span className="font-semibold text-muted-foreground">{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ATS Warnings */}
                {tailorResult.atsWarnings?.length > 0 && (
                  <div className="p-2.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-[10px] uppercase font-bold text-yellow-400 tracking-wider mb-1">ATS Warnings</p>
                    {tailorResult.atsWarnings.map((w: string, i: number) => (
                      <p key={i} className="text-[11px] text-yellow-300 flex gap-1.5"><AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />{w}</p>
                    ))}
                  </div>
                )}

                {/* Feedback */}
                {tailorResult.overallFeedback && (
                  <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-[10px] uppercase font-bold text-blue-400 tracking-wider mb-1">Coach Feedback</p>
                    <p className="text-[11px] text-blue-300">{tailorResult.overallFeedback}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { setTailorStep('setup'); setTailorResult(null); }}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Re-run
                  </Button>
                  <Button size="sm" className="flex-1 text-xs bg-primary" onClick={handleSaveTailored}>
                    <Save className="w-3 h-3 mr-1" /> Save Version
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT RESUME PANEL ── */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-200">
          <div className="sticky top-0 z-10 bg-gray-200 border-b border-gray-300 px-6 py-2 flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              <span className="font-medium">{tailorCandName || 'Select a candidate'}</span>
              {tailorBaseResume && <span className="text-gray-400">· {tailorBaseResume.version_name}</span>}
            </div>
            {tailorStep === 'result' && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-teal-100 border border-teal-400 inline-block" />
                <span>Highlighted = AI edited text</span>
              </div>
            )}
          </div>

          <div className="p-8 flex justify-center">
            {!tailorCandId ? (
              <div className="max-w-[816px] w-full bg-white shadow-xl rounded min-h-[600px] flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm font-medium">Select a candidate to preview their resume</p>
                </div>
              </div>
            ) : !tailorBaseResume || (!tailorBaseResume.raw_text && !tailorBaseResume.summary) ? (
              <div className="max-w-[816px] w-full bg-white shadow-xl rounded min-h-[600px] flex items-center justify-center">
                <div className="text-center text-gray-400 p-8">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500 mb-1">No resume text available</p>
                  <p className="text-xs text-gray-400">Upload this candidate's resume with the text pasted in so the AI can work with it.</p>
                </div>
              </div>
            ) : (
              <div className="max-w-[816px] w-full bg-white shadow-xl rounded p-[52px] font-['Times_New_Roman',serif]">
                <ResumeDocument
                  text={originalText}
                  tailoredText={tailorStep === 'result' ? tailoredText : undefined}
                  isProcessing={tailorStep === 'processing'}
                  showDiff={tailorStep === 'result'}
                />
              </div>
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
                  <Label>Resume File <span className="text-muted-foreground text-xs font-normal">(PDF, DOCX, TXT — for storage & download)</span></Label>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => document.getElementById('resume-file-input')?.click()}
                  >
                    <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    {uploadFile ? (
                      <p className="text-sm font-medium text-primary">{uploadFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to choose a file</p>
                    )}
                    <input
                      id="resume-file-input"
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Resume Text <span className="text-muted-foreground text-xs font-normal">(paste plain text for AI tailoring)</span></Label>
                  <Textarea
                    placeholder="Paste the full plain text of the resume here. This is what the AI reads when tailoring. Required for AI Tailor to work."
                    className="min-h-[140px] text-xs bg-background font-mono resize-none"
                    value={uploadText}
                    onChange={e => setUploadText(e.target.value)}
                  />
                  {uploadText.length > 0 && <p className="text-[11px] text-muted-foreground">{uploadText.length} characters</p>}
                </div>
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded text-[11px] text-blue-400">
                  💡 The AI Tailor only works with the pasted text. Uploading a file stores it for download but doesn't auto-extract text.
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpload} disabled={isUploading} className="bg-primary text-primary-foreground">
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
          <p className="text-muted-foreground text-sm mb-4">Upload a base resume from a candidate profile to get started.</p>
          <Button onClick={() => setUploadOpen(true)} variant="outline"><Upload className="w-4 h-4 mr-2" />Upload Resume</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredData.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5 card-hover flex flex-col group hover:border-primary/30 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground text-base leading-tight truncate pr-2" title={r.candidates?.full_name}>
                    {r.candidates?.full_name || 'Unknown'}
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
                  {r.pdf_file_url ? <a href={r.pdf_file_url} target="_blank" rel="noopener noreferrer"><Download className="w-3 h-3 mr-1.5" />PDF</a> : <><Download className="w-3 h-3 mr-1.5" />PDF</>}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border" disabled={!r.docx_file_url} asChild={!!r.docx_file_url}>
                  {r.docx_file_url ? <a href={r.docx_file_url} target="_blank" rel="noopener noreferrer"><Download className="w-3 h-3 mr-1.5" />DOCX</a> : <><Download className="w-3 h-3 mr-1.5" />DOCX</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
