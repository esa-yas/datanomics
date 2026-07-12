import { RESUME_DOC_SURFACE } from '@/components/resume/ResumeDocumentView';

export function ResumeHtmlPreview({
  html,
  label,
  emptyMessage,
}: {
  html: string | null;
  label?: string;
  emptyMessage?: string;
}) {
  return (
    <div className={`flex flex-col h-full min-h-0 ${RESUME_DOC_SURFACE}`}>
      {label && (
        <div className="px-4 py-2 border-b border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-700 uppercase tracking-wider shrink-0">
          {label}
        </div>
      )}
      <div className="relative flex-1 overflow-auto bg-white">
        {html ? (
          <div
            className="resume-html-host min-h-full"
            style={{ colorScheme: 'light' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm p-8 text-center">
            {emptyMessage || 'Preview loading…'}
          </div>
        )}
      </div>
    </div>
  );
}
