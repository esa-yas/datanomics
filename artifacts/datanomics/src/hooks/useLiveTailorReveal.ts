import { useCallback, useRef, useState } from 'react';
import { buildRevealPlan, THINKING_BUBBLES } from '@/lib/resume/parseResumeLayout';
import { buildTailoredText, type ResumeSectionChange, type TailorResult } from '@/lib/utils/resumeTailor';

const REVEAL_MS = 120;
const BUBBLE_ROTATE_MS = 2800;

export function useLiveTailorReveal() {
  const [liveText, setLiveText] = useState('');
  const [appliedChanges, setAppliedChanges] = useState<ResumeSectionChange[]>([]);
  const [pendingChange, setPendingChange] = useState<ResumeSectionChange | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const cancelRef = useRef(false);
  const bubbleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const startThinkingRotation = () => {
    let i = 0;
    setThinkingMessage(THINKING_BUBBLES[0]);
    bubbleTimer.current = setInterval(() => {
      i = (i + 1) % THINKING_BUBBLES.length;
      setThinkingMessage(THINKING_BUBBLES[i]);
    }, BUBBLE_ROTATE_MS);
  };

  const stopThinkingRotation = () => {
    if (bubbleTimer.current) clearInterval(bubbleTimer.current);
    bubbleTimer.current = null;
  };

  const waitForAi = useCallback((originalText: string) => {
    cancelRef.current = false;
    setLiveText(originalText);
    setAppliedChanges([]);
    setPendingChange(null);
    setIsRevealing(true);
    startThinkingRotation();
    return () => {
      cancelRef.current = true;
      stopThinkingRotation();
    };
  }, []);

  const revealResult = useCallback(
    async (originalText: string, result: TailorResult, jdText = ''): Promise<string> => {
      stopThinkingRotation();
      cancelRef.current = false;
      setIsRevealing(true);
      setLiveText(originalText);
      setAppliedChanges([]);
      setPendingChange(null);

      const steps = buildRevealPlan(result, originalText);
      const finalText = buildTailoredText(originalText, result, jdText);
      const meaningfulSteps = steps.filter((step) => step.change.tailored?.trim());

      if (meaningfulSteps.length === 0) {
        setLiveText(finalText);
        setIsRevealing(false);
        return finalText;
      }

      // Brief highlight on first edit, then show the full tailored text immediately.
      const first = meaningfulSteps[0];
      setThinkingMessage(first.bubble);
      setPendingChange(first.change);
      setAppliedChanges([first.change]);
      await sleep(REVEAL_MS * 2);
      if (cancelRef.current) return finalText;

      setPendingChange(null);
      setAppliedChanges(meaningfulSteps.map((step) => step.change));
      setLiveText(finalText);
      setThinkingMessage(null);
      setIsRevealing(false);
      return finalText;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    stopThinkingRotation();
    setThinkingMessage(null);
    setPendingChange(null);
    setIsRevealing(false);
  }, []);

  const highlightNeedles = appliedChanges.map((c) => c.tailored).filter(Boolean);

  return {
    liveText,
    appliedChanges,
    pendingChange,
    thinkingMessage,
    isRevealing,
    highlightNeedles,
    waitForAi,
    revealResult,
    cancel,
    setThinkingMessage,
  };
}
