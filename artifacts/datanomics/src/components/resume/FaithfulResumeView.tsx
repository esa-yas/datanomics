import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResumeSectionChange } from '@/lib/utils/resumeTailor';
import { parseFaithfulLines } from '@/lib/resume/resumeLines';
import { RESUME_DOC_SURFACE } from '@/components/resume/ResumeDocumentView';
import { AiThinkingBubble } from '@/components/resume/StyledResumeView';

function lineHighlighted(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => n && lower.includes(n.toLowerCase()));
}

function LineContent({
  text,
  highlighted,
  pending,
}: {
  text: string;
  highlighted?: boolean;
  pending?: { original: string; tailored: string } | null;
}) {
  if (pending && (text.includes(pending.original) || pending.original.includes(text))) {
    return (
      <>
        <span className="line-through text-neutral-400">{pending.original}</span>
        <span className="ml-1 bg-teal-100 text-neutral-900 px-0.5 rounded">{pending.tailored}</span>
      </>
    );
  }
  if (highlighted) {
    return <mark className="bg-teal-100 text-neutral-900 px-0.5 rounded">{text}</mark>;
  }
  return <>{text}</>;
}

/**
 * Renders resume text line-for-line exactly as extracted — no invented sections, dividers, or chips.
 */
export function FaithfulResumeView({
  text,
  label,
  legend,
  highlightNeedles = [],
  pendingChange,
  thinkingMessage,
  showCursor = false,
}: {
  text: string;
  label?: string;
  legend?: ReactNode;
  highlightNeedles?: string[];
  pendingChange?: ResumeSectionChange | null;
  thinkingMessage?: string | null;
  showCursor?: boolean;
}) {
  const lines = parseFaithfulLines(text);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (!showCursor) return;
    const id = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(id);
  }, [showCursor]);

  const pending =
    pendingChange?.original?.trim() &&
    (text.includes(pendingChange.original) ||
      pendingChange.original.toLowerCase().includes(text.toLowerCase().slice(0, 80)))
      ? { original: pendingChange.original, tailored: pendingChange.tailored }
      : null;

  return (
    <div className={`flex flex-col h-full min-h-0 ${RESUME_DOC_SURFACE}`}>
      {label && (
        <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider flex items-center justify-between shrink-0 gap-2">
          <span className="truncate">{label}</span>
          {legend}
        </div>
      )}
      <div className="relative flex-1 overflow-auto bg-white">
        <div
          className="px-14 py-12 max-w-[816px] mx-auto min-h-full font-['Times_New_Roman',Times,serif] text-[11pt] leading-[1.15]"
          style={{ color: '#000000' }}
        >
          {lines.map((line, idx) => {
            if (line.isBlank) return <div key={idx} className="h-[6pt]" />;
            const hi = lineHighlighted(line.text, highlightNeedles);
            if (line.isBullet) {
              return (
                <div key={idx} className="flex gap-[6pt] mb-[3pt] pl-[24pt] -indent-[12pt]">
                  <span className="shrink-0 w-[12pt] text-center" style={{ color: '#000' }}>
                    {line.bulletChar || '•'}
                  </span>
                  <span className="flex-1" style={{ color: '#000' }}>
                    <LineContent text={line.text} highlighted={hi} pending={pending} />
                  </span>
                </div>
              );
            }
            return (
              <p key={idx} className="mb-[6pt] whitespace-pre-wrap" style={{ color: '#000' }}>
                <LineContent text={line.text} highlighted={hi} pending={pending} />
              </p>
            );
          })}
          {showCursor && (
            <span
              className={`inline-block w-0.5 h-4 bg-teal-600 ml-0.5 align-middle ${cursorOn ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
        </div>
        {thinkingMessage && <AiThinkingBubble message={thinkingMessage} />}
      </div>
    </div>
  );
}
