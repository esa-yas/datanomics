import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { interviewPracticeService } from '@/services/interviewPracticeService';
import { useElevenLabsInterview } from '@/hooks/useElevenLabsInterview';
import { VoiceInterviewOrb } from '@/components/interview/VoiceInterviewOrb';
import { InterviewTranscriptBubbles } from '@/components/interview/InterviewTranscriptBubbles';
import { Loader2, MicOff, Clock, User, Headphones, AlertCircle } from 'lucide-react';

export default function InterviewPracticePage() {
  const [, params] = useRoute('/interview/:token');
  const token = params?.token ?? '';
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof interviewPracticeService.validatePublicToken>> | null>(null);

  const {
    status,
    voiceMode,
    inputLevel,
    outputLevel,
    statusMessage,
    transcript,
    error,
    reportReady,
    start,
    end,
  } = useElevenLabsInterview(token);

  useEffect(() => {
    if (!token) {
      setPageError('Missing interview link');
      setLoading(false);
      return;
    }
    interviewPracticeService
      .validatePublicToken(token)
      .then(setInfo)
      .catch((err) => setPageError(err instanceof Error ? err.message : 'Invalid link'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="interview-page min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pageError || !info) {
    return (
      <div className="interview-page min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card/80 border border-border rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <h1 className="text-xl font-bold text-destructive">Interview unavailable</h1>
          <p className="text-muted-foreground text-sm">{pageError ?? 'Link not found'}</p>
        </div>
      </div>
    );
  }

  if (info.status === 'completed') {
    return (
      <div className="interview-page min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card/80 border border-border rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <h1 className="text-xl font-bold">Interview complete</h1>
          <p className="text-muted-foreground text-sm">View your feedback report below.</p>
          <Link href={`/interview/${token}/report`}>
            <Button className="w-full">View feedback report</Button>
          </Link>
        </div>
      </div>
    );
  }

  const live = status === 'live' || status === 'connecting';
  const orbMode =
    status === 'connecting' ? 'connecting' : voiceMode === 'idle' && live ? 'listening' : voiceMode;
  const showOrb = live || status === 'ended' || transcript.length > 0;
  const showTranscript = transcript.length > 0 || voiceMode === 'speaking';

  return (
    <div className="interview-page min-h-screen">
      <div className="interview-page-glow pointer-events-none fixed inset-0" aria-hidden />

      <div className="relative max-w-2xl mx-auto px-5 sm:px-6 pb-12">
        <header className="text-center space-y-3 pt-8 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            Mock interview
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">{info.title}</h1>
          <p className="text-muted-foreground text-sm inline-flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 border border-white/8 px-3 py-1">
              <User className="w-3.5 h-3.5 text-primary" /> {info.candidateName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 border border-white/8 px-3 py-1">
              <Clock className="w-3.5 h-3.5 text-secondary" /> {info.durationMinutes} min
            </span>
          </p>
        </header>

        {showOrb ? (
          <VoiceInterviewOrb
            mode={status === 'ended' ? 'idle' : orbMode}
            inputLevel={inputLevel}
            outputLevel={outputLevel}
            statusLabel={statusMessage || 'Interview in progress'}
          />
        ) : (
          <div className="py-14 text-center max-w-md mx-auto space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/15 border border-primary/25 shadow-[0_0_40px_hsl(161_100%_39%_/_0.12)]">
              <Headphones className="h-7 w-7 text-primary" strokeWidth={1.75} />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Answer like a real interview. The AI asks one question at a time — you&apos;ll get a scored
              report when you finish.
            </p>
          </div>
        )}

        {(error || pageError) && (
          <div className="mb-5 mx-auto max-w-md rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 flex gap-3 items-start text-sm text-destructive/95">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error ?? pageError}</p>
          </div>
        )}

        <div className="flex justify-center gap-3">
          {!live && status !== 'ended' && (
            <Button
              size="lg"
              onClick={() => void start()}
              className="gap-2 min-w-[240px] h-12 rounded-xl text-base font-semibold shadow-[0_8px_32px_hsl(161_100%_39%_/_0.25)] hover:shadow-[0_12px_40px_hsl(161_100%_39%_/_0.35)] transition-shadow"
            >
              {info.status === 'started' ? 'Resume voice interview' : 'Start voice interview'}
            </Button>
          )}
          {live && (
            <Button
              size="lg"
              variant="destructive"
              onClick={() => void end()}
              className="gap-2 rounded-xl h-12 px-8"
            >
              <MicOff className="w-5 h-5" /> End interview
            </Button>
          )}
          {status === 'ended' && (
            <Link href={`/interview/${token}/report`}>
              <Button size="lg" className="min-w-[240px] h-12 rounded-xl text-base font-semibold">
                {reportReady ? 'View feedback report' : 'Opening report…'}
              </Button>
            </Link>
          )}
        </div>

        {showTranscript && (
          <InterviewTranscriptBubbles
            lines={transcript}
            candidateName={info.candidateName}
            isSpeaking={voiceMode === 'speaking'}
            isListening={voiceMode === 'listening'}
          />
        )}
      </div>
    </div>
  );
}
