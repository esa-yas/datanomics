import { Mic, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { VoiceMode } from '@/hooks/useElevenLabsInterview';

interface VoiceInterviewOrbProps {
  mode: VoiceMode;
  inputLevel: number;
  outputLevel: number;
  statusLabel: string;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const BAR_COUNT = 12;

function AudioBars({ level, active, variant }: { level: number; active: boolean; variant: 'in' | 'out' }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const angle = (i / BAR_COUNT) * 360;
        const wave = active ? 0.35 + level * 0.65 * (0.6 + Math.sin(i * 1.4) * 0.4) : 0.12;
        const h = 10 + wave * 28;
        return (
          <div
            key={i}
            className="absolute origin-bottom rounded-full transition-all duration-100 ease-out"
            style={{
              width: 3,
              height: h,
              transform: `rotate(${angle}deg) translateY(-76px)`,
              background:
                variant === 'out'
                  ? `linear-gradient(to top, hsl(161 100% 39% / ${0.25 + wave * 0.55}), hsl(202 100% 55% / ${0.15 + wave * 0.45}))`
                  : `linear-gradient(to top, hsl(202 100% 50% / ${0.2 + wave * 0.5}), hsl(161 100% 45% / ${0.12 + wave * 0.4}))`,
              opacity: active ? 0.5 + wave * 0.5 : 0.2,
            }}
          />
        );
      })}
    </div>
  );
}

export function VoiceInterviewOrb({
  mode,
  inputLevel,
  outputLevel,
  statusLabel,
}: VoiceInterviewOrbProps) {
  const listening = mode === 'listening';
  const speaking = mode === 'speaking';
  const connecting = mode === 'connecting';
  const active = listening || speaking;
  const pulse = listening ? inputLevel : speaking ? outputLevel : connecting ? 0.2 : 0.1;
  const ringScale = 1 + pulse * 0.42;
  const orbScale = 1 + pulse * 0.16;

  const statusTone = speaking ? 'speaking' : listening ? 'listening' : connecting ? 'connecting' : 'idle';

  return (
    <div className="relative flex flex-col items-center justify-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm ${
          statusTone === 'speaking'
            ? 'border-secondary/35 bg-secondary/10 text-secondary-foreground/90'
            : statusTone === 'listening'
              ? 'border-primary/35 bg-primary/10 text-primary'
              : statusTone === 'connecting'
                ? 'border-white/10 bg-white/5 text-muted-foreground'
                : 'border-white/8 bg-card/40 text-muted-foreground'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            statusTone === 'speaking'
              ? 'bg-secondary animate-pulse'
              : statusTone === 'listening'
                ? 'bg-primary animate-pulse'
                : 'bg-muted-foreground/60'
          }`}
        />
        {statusLabel}
      </motion.div>

      <div className="relative flex h-60 w-60 items-center justify-center">
        <AudioBars level={outputLevel} active={speaking} variant="out" />
        <AudioBars level={inputLevel} active={listening} variant="in" />

        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full border border-primary/15"
          animate={{ scale: ringScale * 1.38, opacity: active ? 0.2 + pulse * 0.35 : 0.1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        />
        <motion.div
          className="pointer-events-none absolute inset-3 rounded-full border border-secondary/20"
          animate={{ scale: ringScale * 1.18, opacity: active ? 0.3 + pulse * 0.3 : 0.12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        />
        <motion.div
          className="pointer-events-none absolute inset-6 rounded-full border border-primary/25"
          animate={{ scale: ringScale, opacity: active ? 0.4 + pulse * 0.28 : 0.15 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        />

        <motion.div
          className="pointer-events-none absolute h-44 w-44 rounded-full blur-3xl"
          animate={{ opacity: active ? 0.5 + pulse * 0.35 : 0.22, scale: 1 + pulse * 0.08 }}
          transition={{ duration: 0.2 }}
          style={{
            background:
              speaking
                ? 'radial-gradient(circle, hsl(161 100% 42% / 0.55), hsl(202 100% 48% / 0.22) 58%, transparent 72%)'
                : 'radial-gradient(circle, hsl(202 100% 48% / 0.42), hsl(161 100% 39% / 0.18) 58%, transparent 72%)',
          }}
        />

        <motion.div
          className="relative flex h-28 w-28 items-center justify-center rounded-full shadow-[0_0_80px_hsl(161_100%_39%_/_0.4)]"
          animate={{ scale: orbScale }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          style={{
            background: speaking
              ? 'radial-gradient(circle at 32% 28%, hsl(161 100% 58%), hsl(202 100% 52%) 48%, hsl(224 45% 24%) 100%)'
              : listening
                ? 'radial-gradient(circle at 68% 32%, hsl(202 100% 58%), hsl(161 100% 44%) 52%, hsl(218 48% 20%) 100%)'
                : 'radial-gradient(circle at 50% 38%, hsl(161 100% 48%), hsl(202 100% 42%) 62%, hsl(218 48% 18%) 100%)',
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/15 via-transparent to-transparent" />
          <div className="absolute inset-[3px] rounded-full border border-white/10" />

          {speaking ? (
            <motion.div
              animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="relative z-10 h-10 w-10 text-white drop-shadow-lg" strokeWidth={1.75} />
            </motion.div>
          ) : (
            <Mic
              className="relative z-10 h-9 w-9 text-white drop-shadow-lg transition-transform duration-75"
              style={{ transform: `scale(${1 + clamp01(inputLevel) * 0.28})` }}
              strokeWidth={1.75}
            />
          )}
        </motion.div>

        {active && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-full"
            animate={{ opacity: [0.25, 0.45, 0.25] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            style={{
              background:
                'radial-gradient(ellipse 85% 45% at 50% 50%, hsl(161 100% 55% / 0.2), transparent 68%)',
            }}
          />
        )}
      </div>
    </div>
  );
}
