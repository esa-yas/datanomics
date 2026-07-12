import { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import {
  interviewPracticeService,
  type InterviewMessage,
  type InterviewResult,
} from '@/services/interviewPracticeService';
import { Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const v = score ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{score != null ? score : '—'}/100</span>
      </div>
      <Progress value={v} className="h-2" />
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">{title}</h3>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function InterviewPracticeReportPage() {
  const [, params] = useRoute('/interview/:token/report');
  const token = params?.token ?? '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [title, setTitle] = useState('');
  const [sessionStatus, setSessionStatus] = useState<string>('');
  const hasResultRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setError('Missing token');
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 18;

    const load = async () => {
      attempts += 1;
      try {
        const data = await interviewPracticeService.getPublicResult(token);
        if (cancelled) return;
        setTitle(data.session.title);
        setSessionStatus(data.session.status);
        setMessages(data.messages ?? []);
        if (data.result) {
          hasResultRef.current = true;
          setResult(data.result);
          setError(null);
          setLoading(false);
        } else if (data.session.status !== 'completed') {
          if (attempts >= 2) {
            try {
              await interviewPracticeService.finishPublicInterview(token);
              return;
            } catch {
              /* keep polling */
            }
          }
          setError(null);
          setLoading(true);
        } else if (attempts >= maxAttempts) {
          setError('Feedback report is taking longer than expected. Please refresh in a minute.');
          setLoading(false);
        } else {
          setError(null);
          setLoading(true);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Report not ready';
        if (msg.includes('not completed') && attempts < maxAttempts) {
          setLoading(true);
          return;
        }
        setError(msg);
        setLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => {
      if (!hasResultRef.current && !cancelled) void load();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  if (loading && !result) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground text-center">
          {sessionStatus === 'completed'
            ? 'Generating your feedback report…'
            : 'Waiting for interview to complete…'}
        </p>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{error}</p>
          {messages.length > 0 && (
            <div className="text-left bg-card border border-border rounded-xl p-4 mt-4">
              <h2 className="font-semibold text-sm mb-2">Transcript saved</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto text-sm">
                {messages.map((m) => (
                  <p key={m.id}>
                    <span className="font-medium">{m.role === 'ai' ? 'Interviewer' : 'You'}:</span>{' '}
                    {m.message_text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Still preparing your report…</p>
        </div>
      </div>
    );
  }

  const readinessColor =
    result.hiring_readiness === 'high'
      ? 'text-teal-400'
      : result.hiring_readiness === 'medium'
        ? 'text-yellow-400'
        : 'text-orange-400';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <TrendingUp className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-2xl font-display font-bold">Interview feedback</h1>
          <p className="text-muted-foreground text-sm">{title}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">Overall score</span>
            <span className="text-3xl font-bold text-primary">
              {result.overall_score ?? '—'}
            </span>
          </div>
          {result.hiring_readiness && (
            <p className={`text-sm font-medium ${readinessColor}`}>
              Hiring readiness: {result.hiring_readiness.toUpperCase()}
            </p>
          )}

          <div className="space-y-3 pt-2">
            <ScoreBar label="Communication" score={result.communication_score} />
            <ScoreBar label="Technical alignment" score={result.technical_score} />
            <ScoreBar label="JD alignment" score={result.jd_alignment_score} />
            <ScoreBar label="Confidence & clarity" score={result.confidence_score} />
          </div>
        </div>

        {result.final_summary && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold mb-2">Summary</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.final_summary}</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <ListSection title="Strengths" items={result.strengths ?? []} />
          <ListSection title="Areas to improve" items={result.weaknesses ?? []} />
          <ListSection title="Missed keywords / concepts" items={result.missed_keywords ?? []} />
          <ListSection title="Suggested improved answers" items={result.suggested_improvements ?? []} />
          <ListSection title="Recommended practice" items={result.recommended_practice ?? []} />
        </div>
      </div>
    </div>
  );
}
