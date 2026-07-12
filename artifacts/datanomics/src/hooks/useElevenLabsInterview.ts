import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';
import { interviewPracticeService } from '@/services/interviewPracticeService';

export type LiveInterviewStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'live'
  | 'ended'
  | 'error';

export type VoiceMode = 'idle' | 'connecting' | 'listening' | 'speaking';

interface TranscriptLine {
  role: 'ai' | 'candidate';
  text: string;
}

export function useElevenLabsInterview(token: string) {
  const [status, setStatus] = useState<LiveInterviewStatus>('idle');
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('idle');
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportReady, setReportReady] = useState(false);

  const conversationRef = useRef<VoiceConversation | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const stopVolumeLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    stopVolumeLoop();
    conversationRef.current = null;
    conversationIdRef.current = null;
    endedRef.current = false;
    setVoiceMode('idle');
  }, [stopVolumeLoop]);

  const startVolumeLoop = useCallback(() => {
    stopVolumeLoop();
    const tick = () => {
      const conv = conversationRef.current;
      if (conv?.isOpen()) {
        setInputLevel(conv.getInputVolume());
        setOutputLevel(conv.getOutputVolume());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopVolumeLoop]);

  useEffect(() => () => {
    void conversationRef.current?.endSession().catch(() => undefined);
    cleanup();
  }, [cleanup]);

  const appendTranscript = useCallback((role: 'ai' | 'candidate', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role && last.text === trimmed) return prev;
      return [...prev, { role, text: trimmed }];
    });
  }, []);

  const finalizeInterview = useCallback(
    async (conversationId?: string) => {
      try {
        await interviewPracticeService.finishPublicInterview(token, conversationId);
        setReportReady(true);
      } catch {
        setReportReady(false);
      }
    },
    [token],
  );

  const start = useCallback(async () => {
    setError(null);
    setReportReady(false);
    setStatus('connecting');
    setVoiceMode('connecting');
    setStatusMessage('Requesting microphone access…');

    try {
      await conversationRef.current?.endSession().catch(() => undefined);
      cleanup();
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      setStatusMessage('Connecting to voice interviewer…');
      const { conversationToken, overrides } = await interviewPracticeService.getVoiceToken(token);

      const conversation = await Conversation.startSession({
        conversationToken,
        connectionType: 'webrtc',
        useWakeLock: true,
        overrides,
        onConnect: ({ conversationId }) => {
          conversationIdRef.current = conversationId;
          setStatus('live');
          setVoiceMode('listening');
          setStatusMessage('Listening…');
          startVolumeLoop();
        },
        onDisconnect: (details) => {
          stopVolumeLoop();
          if (!endedRef.current) {
            const dropped = details.reason !== 'user';
            setStatus(dropped ? 'error' : 'ended');
            setVoiceMode('idle');
            setStatusMessage(
              dropped
                ? 'Connection lost. Tap End interview if you are done, or refresh to retry.'
                : 'Generating your feedback report…',
            );
            if (!dropped) {
              void finalizeInterview(conversationIdRef.current ?? undefined);
            }
          }
          cleanup();
        },
        onError: (message, context) => {
          const detail =
            context && typeof context === 'object' && 'debugMessage' in context
              ? String((context as { debugMessage?: string }).debugMessage ?? '')
              : '';
          const text = [message, detail].filter(Boolean).join(' — ') || 'Voice interview error';
          setError(text);
          setStatus('error');
          setVoiceMode('idle');
          stopVolumeLoop();
          cleanup();
        },
        onMessage: ({ role, message }) => {
          appendTranscript(role === 'user' ? 'candidate' : 'ai', message);
        },
        onModeChange: ({ mode }) => {
          if (mode === 'speaking') {
            setVoiceMode('speaking');
            setStatusMessage('Interviewer is speaking…');
          } else {
            setVoiceMode('listening');
            setStatusMessage('Listening…');
          }
          setStatus('live');
        },
        onStatusChange: ({ status: connStatus }) => {
          if (connStatus === 'connecting') {
            setStatus('connecting');
            setVoiceMode('connecting');
            setStatusMessage('Connecting to voice interviewer…');
          }
        },
        onDebug: (payload) => {
          if (import.meta.env.DEV) {
            console.debug('[elevenlabs]', payload);
          }
        },
      });

      conversationRef.current = conversation as VoiceConversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start interview');
      setStatus('error');
      setVoiceMode('idle');
      cleanup();
    }
  }, [appendTranscript, cleanup, finalizeInterview, startVolumeLoop, stopVolumeLoop, token]);

  const end = useCallback(async () => {
    endedRef.current = true;
    setStatus('ended');
    setVoiceMode('idle');
    setStatusMessage('Generating your feedback report…');
    stopVolumeLoop();
    try {
      await conversationRef.current?.endSession();
    } catch {
      /* session may already be closed */
    }
    await finalizeInterview(conversationIdRef.current ?? undefined);
    cleanup();
  }, [cleanup, finalizeInterview, stopVolumeLoop]);

  return {
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
  };
}
