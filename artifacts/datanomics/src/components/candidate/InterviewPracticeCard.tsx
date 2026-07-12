import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  interviewPracticeService,
  type InterviewSession,
  type InterviewType,
  type InterviewDifficulty,
} from '@/services/interviewPracticeService';
import type { Resume } from '@/types';
import {
  Mic,
  Copy,
  Loader2,
  Link2,
  Ban,
  ChevronRight,
  Trophy,
} from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  started: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
  revoked: 'Revoked',
};

const TYPE_OPTIONS: { value: InterviewType; label: string }[] = [
  { value: 'recruiter_screen', label: 'Recruiter screen' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'technical', label: 'Technical' },
  { value: 'final_round', label: 'Final round' },
];

interface Props {
  candidateId: string;
  candidateName: string;
  resumes: Resume[];
}

export function InterviewPracticeCard({ candidateId, candidateName, resumes }: Props) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<Awaited<
    ReturnType<typeof interviewPracticeService.getStaffResult>
  > | null>(null);

  const [title, setTitle] = useState(`${candidateName} — Mock interview`);
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [resumeSource, setResumeSource] = useState('manual');
  const [focusNotes, setFocusNotes] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('behavioral');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('medium');
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 45 | 60>(30);
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });

  const loadSessions = useCallback(async () => {
    try {
      const data = await interviewPracticeService.listForCandidate(candidateId);
      setSessions(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (resumeSource === 'manual') return;
    const resume = resumes.find((r) => r.id === resumeSource);
    if (resume?.raw_text) setResumeText(resume.raw_text);
  }, [resumeSource, resumes]);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setCreating(true);
    try {
      const { url } = await interviewPracticeService.createSession({
        candidateId,
        title: title.trim(),
        jobDescription,
        resumeText,
        focusNotes,
        interviewType,
        difficulty,
        durationMinutes,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setLastLink(url);
      toast.success('Interview link created');
      setDialogOpen(false);
      await loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const handleRevoke = async (sessionId: string) => {
    try {
      await interviewPracticeService.revokeSession(sessionId);
      toast.success('Link revoked');
      await loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    }
  };

  const openReport = async (sessionId: string) => {
    setSelectedReportId(sessionId);
    try {
      const data = await interviewPracticeService.getStaffResult(sessionId);
      setReportData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load report');
    }
  };

  const latestScore = sessions.find((s) => s.result?.overall_score != null)?.result?.overall_score;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" /> AI voice interview practice
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create a secure link for {candidateName} to practice with a live AI interviewer.
          </p>
          {latestScore != null && (
            <p className="text-sm mt-2 flex items-center gap-1 text-teal-400">
              <Trophy className="w-4 h-4" /> Latest score: {latestScore}/100
            </p>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Link2 className="w-4 h-4" /> Create interview practice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create interview practice session</DialogTitle>
              <DialogDescription>
                Configure the mock interview. A secure link will be generated for the candidate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Interview title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Job description</Label>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={4}
                  placeholder="Paste the JD for this practice session…"
                />
              </div>
              <div className="space-y-2">
                <Label>Resume source</Label>
                <Select value={resumeSource} onValueChange={setResumeSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Paste manually</SelectItem>
                    {resumes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.version_name || r.job_title || r.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={4}
                  placeholder="Resume text for the interviewer…"
                />
              </div>
              <div className="space-y-2">
                <Label>Focus notes (team guidance)</Label>
                <Textarea
                  value={focusNotes}
                  onChange={(e) => setFocusNotes(e.target.value)}
                  rows={3}
                  placeholder="Areas to probe: Power BI, SQL, stakeholder communication…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Interview type</Label>
                  <Select
                    value={interviewType}
                    onValueChange={(v) => setInterviewType(v as InterviewType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as InterviewDifficulty)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select
                    value={String(durationMinutes)}
                    onValueChange={(v) =>
                      setDurationMinutes(Number(v) as 15 | 30 | 45 | 60)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Link expires</Label>
                  <Input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => void handleCreate()} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create link'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {lastLink && (
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm flex-1 truncate font-mono">{lastLink}</span>
          <Button size="sm" variant="secondary" onClick={() => void copyLink(lastLink)}>
            <Copy className="w-4 h-4 mr-1" /> Copy link
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No interview sessions yet. Create a link and send it to the candidate.
        </p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {sessions.map((s) => (
            <div key={s.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {STATUS_LABEL[s.status] ?? s.status} · {s.duration_minutes} min ·{' '}
                  {s.interview_type.replace(/_/g, ' ')}
                  {s.result?.overall_score != null && ` · Score ${s.result.overall_score}`}
                </p>
              </div>
              <div className="flex gap-2">
                {s.status === 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => void openReport(s.id)}>
                    Report <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
                {['pending', 'started'].includes(s.status) && (
                  <Button size="sm" variant="ghost" onClick={() => void handleRevoke(s.id)}>
                    <Ban className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedReportId && reportData && (
        <Dialog open onOpenChange={() => { setSelectedReportId(null); setReportData(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Feedback — {reportData.session.title}</DialogTitle>
              <DialogDescription>AI-generated scores and coaching notes.</DialogDescription>
            </DialogHeader>
            {reportData.result ? (
              <div className="space-y-4 text-sm">
                <p className="text-2xl font-bold text-primary">
                  {reportData.result.overall_score ?? '—'}/100
                </p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {reportData.result.final_summary}
                </p>
                {reportData.result.strengths?.length > 0 && (
                  <div>
                    <p className="font-medium">Strengths</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {reportData.result.strengths.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {reportData.result.weaknesses?.length > 0 && (
                  <div>
                    <p className="font-medium">Weak areas</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {reportData.result.weaknesses.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No report generated yet.</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
