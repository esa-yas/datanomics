import type { ReactNode } from 'react';
import type { TextSegment } from '@/lib/utils/resumeTailor';

/** Force readable black text on white — overrides app dark theme inheritance. */
export const RESUME_DOC_SURFACE =
  'resume-doc-light bg-white text-neutral-900';

function segmentClass(seg: TextSegment): string {
  if (!seg.changed) return 'text-neutral-900';
  switch (seg.variant) {
    case 'impact':
      return 'bg-amber-200 text-neutral-900 border-b-2 border-amber-500 font-semibold rounded-sm px-0.5';
    case 'ai':
      return 'bg-teal-200 text-neutral-900 border-b-2 border-teal-600 rounded-sm px-0.5';
    case 'keyword':
    default:
      return 'bg-emerald-100 text-neutral-900 border-b-2 border-emerald-500 rounded-sm px-0.5';
  }
}

function renderFormattedLine(text: string, idx: number, highlight?: boolean) {
  const t = text;
  const isBlank = t.trim() === '';
  const isAllCaps = t.trim().length > 2 && t.trim() === t.trim().toUpperCase() && /[A-Z]/.test(t);
  const isBullet = /^\s*[•\-–*]\s/.test(t) || /^\s{2,}/.test(t);
  const isContact = idx < 4 && (t.includes('@') || t.includes('|') || t.includes('linkedin'));
  const isName = idx === 0 && t.trim().length > 0;

  if (isBlank) return <div key={idx} className="h-2" />;

  let className = 'text-neutral-800 text-[13px] leading-relaxed whitespace-pre-wrap';
  if (isName) className = 'text-neutral-900 text-xl font-bold mb-0.5 whitespace-pre-wrap';
  else if (isContact) className = 'text-neutral-600 text-[11px] whitespace-pre-wrap';
  else if (isAllCaps)
    className =
      'text-neutral-900 text-[12px] font-bold uppercase tracking-widest border-b border-neutral-300 pb-0.5 mt-3 mb-1 whitespace-pre-wrap';
  else if (isBullet) className = 'text-neutral-800 text-[12px] leading-relaxed pl-4 whitespace-pre-wrap';

  const highlightClass = highlight
    ? 'bg-emerald-100 border-l-2 border-emerald-500 pl-1 rounded-sm text-neutral-900'
    : '';

  return (
    <div key={idx} className={`${className} ${highlightClass}`}>
      {t}
    </div>
  );
}

function renderSegment(seg: TextSegment, i: number) {
  if (!seg.changed) {
    return (
      <span key={i} className="text-neutral-900" style={{ color: '#171717' }}>
        {seg.text}
      </span>
    );
  }
  return (
    <mark key={i} className={segmentClass(seg)} style={{ color: '#171717' }}>
      {seg.text}
    </mark>
  );
}

/** Plain resume text — original upload, unchanged structure. */
export function ResumeDocumentView({
  text,
  isProcessing,
  label,
}: {
  text: string;
  isProcessing?: boolean;
  label?: string;
}) {
  const lines = text.split('\n');

  return (
    <div className={`flex flex-col h-full min-h-0 ${RESUME_DOC_SURFACE}`}>
      {label && (
        <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider shrink-0">
          {label}
        </div>
      )}
      <div className="relative flex-1 overflow-auto bg-white">
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[1px]">
            <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin mb-3" />
            <p className="text-xs text-neutral-600 font-medium">AI is editing…</p>
          </div>
        )}
        <div
          className={`resume-body p-[52px] font-['Times_New_Roman',serif] min-h-full transition-opacity ${isProcessing ? 'opacity-50' : 'opacity-100'}`}
          style={{ color: '#171717' }}
        >
          {lines.map((line, idx) => renderFormattedLine(line, idx))}
        </div>
      </div>
    </div>
  );
}

/** Tailored / live keyword resume with inline highlights. */
export function TailoredResumeView({
  segments,
  isProcessing,
  label,
  legend,
}: {
  segments: TextSegment[];
  isProcessing?: boolean;
  label?: string;
  legend?: ReactNode;
}) {
  return (
    <div className={`flex flex-col h-full min-h-0 ${RESUME_DOC_SURFACE}`}>
      {label && (
        <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider flex items-center justify-between shrink-0 gap-2">
          <span className="truncate">{label}</span>
          {legend ?? (
            <span className="flex items-center gap-2 font-normal normal-case tracking-normal text-neutral-600 shrink-0 text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 border border-amber-500" />
                High impact
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-500" />
                JD match
              </span>
            </span>
          )}
        </div>
      )}
      <div className="relative flex-1 overflow-auto bg-white">
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[1px]">
            <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin mb-3" />
            <p className="text-xs text-neutral-600 font-medium">Applying edits…</p>
          </div>
        )}
        <div
          className={`resume-body p-[52px] font-['Times_New_Roman',serif] min-h-full text-[13px] leading-relaxed whitespace-pre-wrap transition-opacity ${isProcessing ? 'opacity-50' : 'opacity-100'}`}
          style={{ color: '#171717' }}
        >
          {segments.map((seg, i) => renderSegment(seg, i))}
        </div>
      </div>
    </div>
  );
}

export function ResumePdfPreview({
  url,
  label,
  emptyMessage,
  isGenerating,
}: {
  url: string | null;
  label?: string;
  emptyMessage?: string;
  isGenerating?: boolean;
}) {
  return (
    <div className={`flex flex-col h-full min-h-0 ${RESUME_DOC_SURFACE}`}>
      {label && (
        <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider flex items-center justify-between shrink-0">
          <span>{label}</span>
          {isGenerating && (
            <span className="font-normal normal-case tracking-normal text-teal-700 animate-pulse">
              Updating preview…
            </span>
          )}
        </div>
      )}
      <div className="relative flex-1 min-h-0 bg-neutral-100">
        {isGenerating && url && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
            <div className="w-7 h-7 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          </div>
        )}
        {url ? (
          <iframe
            title={label || 'Resume PDF'}
            src={`${url}#toolbar=0&navpanes=0`}
            className="absolute inset-0 w-full h-full bg-white"
            style={{ colorScheme: 'light' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white text-neutral-500 text-sm p-8 text-center">
            {emptyMessage || 'PDF preview will appear here'}
          </div>
        )}
      </div>
    </div>
  );
}
