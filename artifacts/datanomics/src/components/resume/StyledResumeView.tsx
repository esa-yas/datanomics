import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResumeSectionChange } from '@/lib/utils/resumeTailor';
import { parseResumeToBlocks, parseSkillItems, type ResumeBlock } from '@/lib/resume/parseResumeLayout';
import { RESUME_DOC_SURFACE } from '@/components/resume/ResumeDocumentView';

function blockContainsHighlight(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => n && lower.includes(n.toLowerCase()));
}

function BlockText({
  text,
  highlighted,
  pending,
}: {
  text: string;
  highlighted?: boolean;
  pending?: { original: string; tailored: string } | null;
}) {
  const showPending = pending && text.includes(pending.original);
  if (showPending && pending) {
    return (
      <span className="inline">
        <span className="line-through text-neutral-400 opacity-80">{pending.original}</span>
        <span className="ml-1 inline-block animate-pulse bg-teal-100 text-teal-900 px-1 rounded border border-teal-400">
          {pending.tailored}
        </span>
      </span>
    );
  }

  if (highlighted) {
    return (
      <mark className="bg-teal-100 text-neutral-900 border-l-2 border-teal-500 pl-1 rounded-sm not-italic">
        {text}
      </mark>
    );
  }

  return <>{text}</>;
}

function renderBlock(
  block: ResumeBlock,
  idx: number,
  highlightNeedles: string[],
  pendingChange: ResumeSectionChange | null | undefined,
) {
  const highlighted = blockContainsHighlight(block.text, highlightNeedles);
  const pending =
    pendingChange?.original?.trim() &&
    (block.text.includes(pendingChange.original) ||
      pendingChange.original.includes(block.text) ||
      block.text.toLowerCase().includes(pendingChange.original.toLowerCase()))
      ? { original: pendingChange.original, tailored: pendingChange.tailored }
      : null;

  switch (block.type) {
    case 'blank':
      return <div key={idx} className="h-2" />;

    case 'name':
      return (
        <h1
          key={idx}
          className="text-[22px] font-bold text-neutral-900 tracking-tight leading-tight mb-1"
          style={{ color: '#171717' }}
        >
          <BlockText text={block.text} highlighted={highlighted} pending={pending} />
        </h1>
      );

    case 'headline':
      return (
        <p key={idx} className="text-[13px] font-semibold text-neutral-700 mb-1.5" style={{ color: '#404040' }}>
          <BlockText text={block.text} highlighted={highlighted} pending={pending} />
        </p>
      );

    case 'contact':
      return (
        <p key={idx} className="text-[11px] text-neutral-600 mb-3 pb-3 border-b border-neutral-300" style={{ color: '#525252' }}>
          <BlockText text={block.text} highlighted={highlighted} pending={pending} />
        </p>
      );

    case 'section':
      return (
        <div key={idx} className="mt-4 mb-2 first:mt-0">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-900 mb-1"
            style={{ color: '#171717' }}
          >
            <BlockText text={block.text} highlighted={highlighted} pending={pending} />
          </h2>
          <div className="h-px bg-neutral-400 w-full" />
        </div>
      );

    case 'bullet':
      return (
        <div key={idx} className="flex gap-2.5 mb-1.5 pl-0.5">
          <span className="text-neutral-800 shrink-0 mt-[2px] text-[13px]" aria-hidden>
            •
          </span>
          <p className="text-[12.5px] leading-relaxed text-neutral-800 flex-1" style={{ color: '#262626' }}>
            <BlockText text={block.text} highlighted={highlighted} pending={pending} />
          </p>
        </div>
      );

    case 'skills': {
      const items = parseSkillItems(block.text);
      if (items.length >= 3) {
        return (
          <div key={idx} className="flex flex-wrap gap-1.5 mb-2">
            {items.map((skill) => (
              <span
                key={skill}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                  highlightNeedles.some((n) => skill.toLowerCase().includes(n.toLowerCase()))
                    ? 'bg-teal-50 text-teal-900 border-teal-400'
                    : 'bg-neutral-100 text-neutral-800 border-neutral-300'
                }`}
              >
                {skill}
              </span>
            ))}
          </div>
        );
      }
      return (
        <p key={idx} className="text-[12px] text-neutral-800 mb-2 leading-relaxed">
          <BlockText text={block.text} highlighted={highlighted} pending={pending} />
        </p>
      );
    }

    case 'paragraph':
    default:
      return (
        <p key={idx} className="text-[12.5px] leading-relaxed text-neutral-800 mb-2" style={{ color: '#262626' }}>
          <BlockText text={block.text} highlighted={highlighted} pending={pending} />
        </p>
      );
  }
}

export function AiThinkingBubble({ message }: { message: string }) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 max-w-[90%] pointer-events-none">
      <div className="relative bg-white border-2 border-teal-500/40 shadow-lg rounded-2xl px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white text-[10px] font-bold">
            AI
          </span>
          <p className="text-[13px] text-neutral-800 leading-snug font-medium" style={{ color: '#171717' }}>
            {message}
          </p>
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r-2 border-b-2 border-teal-500/40 rotate-45" />
      </div>
    </div>
  );
}

export function StyledResumeView({
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
  const blocks = parseResumeToBlocks(text);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (!showCursor) return;
    const id = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(id);
  }, [showCursor]);

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
          className="resume-body px-12 py-10 max-w-[720px] mx-auto min-h-full font-['Times_New_Roman',serif]"
          style={{ color: '#171717' }}
        >
          {blocks.map((block, idx) =>
            renderBlock(block, idx, highlightNeedles, pendingChange),
          )}
          {showCursor && (
            <span
              className={`inline-block w-0.5 h-4 bg-teal-500 ml-0.5 align-middle ${cursorOn ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
        </div>
        {thinkingMessage && <AiThinkingBubble message={thinkingMessage} />}
      </div>
    </div>
  );
}
