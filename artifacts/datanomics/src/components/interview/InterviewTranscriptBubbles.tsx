import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Sparkles, User } from 'lucide-react';

export interface TranscriptLine {
  role: 'ai' | 'candidate';
  text: string;
}

interface InterviewTranscriptBubblesProps {
  lines: TranscriptLine[];
  candidateName?: string;
  isSpeaking?: boolean;
  isListening?: boolean;
}

function SpeakingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-secondary/90"
          animate={{ y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.85, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function Avatar({
  role,
  candidateName,
}: {
  role: 'ai' | 'candidate';
  candidateName?: string;
}) {
  const initial = candidateName?.trim().charAt(0).toUpperCase() || 'Y';

  if (role === 'ai') {
    return (
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-full bg-secondary/40 blur-md scale-110" />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-primary shadow-[0_0_20px_hsl(202_100%_45%_/_0.35)] ring-2 ring-white/10">
          <Sparkles className="h-4 w-4 text-white" strokeWidth={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className="absolute inset-0 rounded-full bg-primary/35 blur-md scale-110" />
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground text-sm font-bold shadow-[0_0_20px_hsl(161_100%_39%_/_0.4)] ring-2 ring-white/10">
        {initial !== 'Y' ? initial : <User className="h-4 w-4" />}
      </div>
    </div>
  );
}

function MessageBubble({
  line,
  candidateName,
  index,
}: {
  line: TranscriptLine;
  candidateName?: string;
  index: number;
}) {
  const isAi = line.role === 'ai';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}
    >
      <Avatar role={line.role} candidateName={candidateName} />
      <div className={`max-w-[min(100%,28rem)] ${isAi ? 'items-start' : 'items-end'} flex flex-col gap-1`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
          {isAi ? 'Interviewer' : 'You'}
        </span>
        <div
          className={
            isAi
              ? 'relative rounded-2xl rounded-tl-md border border-secondary/25 bg-gradient-to-br from-secondary/12 via-card/90 to-card/70 px-4 py-3 text-sm leading-relaxed text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'relative rounded-2xl rounded-tr-md border border-primary/30 bg-gradient-to-br from-primary/18 via-primary/10 to-card/80 px-4 py-3 text-sm leading-relaxed text-foreground shadow-[0_8px_24px_hsl(161_100%_39%_/_0.08),inset_0_1px_0_rgba(255,255,255,0.08)]'
          }
        >
          {!isAi && (
            <Mic className="absolute -top-2 -right-2 h-4 w-4 text-primary/70 opacity-80" strokeWidth={2.5} />
          )}
          <p className="whitespace-pre-wrap">{line.text}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function InterviewTranscriptBubbles({
  lines,
  candidateName,
  isSpeaking = false,
  isListening = false,
}: InterviewTranscriptBubblesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lines.length, isSpeaking]);

  if (lines.length === 0 && !isSpeaking) return null;

  return (
    <div className="interview-transcript-shell mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-card/80 via-card/50 to-background/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {(isListening || isSpeaking) && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isSpeaking ? 'bg-secondary' : isListening ? 'bg-primary' : 'bg-muted-foreground/50'
              }`}
            />
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Live conversation
          </h2>
        </div>
        {(isListening || isSpeaking) && (
          <span className="text-[10px] font-medium text-primary/90">
            {isSpeaking ? 'Interviewer speaking' : 'Listening to you'}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="interview-transcript-scroll max-h-[min(22rem,50vh)] space-y-5 overflow-y-auto px-4 py-5"
      >
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <MessageBubble key={`${line.role}-${i}-${line.text.slice(0, 24)}`} line={line} candidateName={candidateName} index={i} />
          ))}
        </AnimatePresence>

        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <Avatar role="ai" />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                Interviewer
              </span>
              <div className="rounded-2xl rounded-tl-md border border-secondary/20 bg-secondary/10 px-5 py-2">
                <SpeakingDots />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}
