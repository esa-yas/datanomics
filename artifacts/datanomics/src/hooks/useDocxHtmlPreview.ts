import { useEffect, useRef, useState } from 'react';
import { docxBufferToInnerHtml } from '@/lib/resume/extractResumeContent';
import { buildTailoredDocxFromSource } from '@/lib/resume/exportTailored';
import type { SourceResumeSnapshot } from '@/lib/resume/sourceResumeSnapshot';
import type { ResumeSectionChange } from '@/lib/utils/resumeTailor';

/** Returns mammoth inner HTML from patched docx (body edits only — compose header separately). */
export function useDocxInnerPreview(
  docxUrl: string | undefined,
  tailoredText: string,
  sectionChanges: ResumeSectionChange[],
  enabled: boolean,
  debounceMs = 400,
  originalText?: string,
  optimizedSummary?: string,
  suggestedTitle?: string,
  sourceSnapshot?: SourceResumeSnapshot,
) {
  const [innerHtml, setInnerHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled || !docxUrl || !tailoredText.trim()) {
      setInnerHtml(null);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      const id = ++requestId.current;
      try {
        const { blob } = await buildTailoredDocxFromSource(
          docxUrl,
          sectionChanges,
          tailoredText,
          originalText,
          optimizedSummary,
          suggestedTitle,
          undefined,
          sourceSnapshot,
        );
        const inner = await docxBufferToInnerHtml(await blob.arrayBuffer());
        if (id === requestId.current) {
          setInnerHtml(inner);
          setIsLoading(false);
        }
      } catch {
        if (id === requestId.current) {
          setInnerHtml(null);
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [docxUrl, tailoredText, originalText, optimizedSummary, suggestedTitle, sourceSnapshot, enabled, debounceMs, JSON.stringify(sectionChanges)]);

  return { innerHtml, isLoading };
}

export function useSourceDocxInner(docxUrl: string | undefined) {
  const [innerHtml, setInnerHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!docxUrl) {
      setInnerHtml(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const res = await fetch(docxUrl);
        if (!res.ok) throw new Error('fetch failed');
        const inner = await docxBufferToInnerHtml(await res.arrayBuffer());
        if (!cancelled) setInnerHtml(inner);
      } catch {
        if (!cancelled) setInnerHtml(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docxUrl]);

  return { innerHtml, isLoading };
}

/** @deprecated use useSourceDocxInner + compose in page */
export function useSourceDocxHtml(docxUrl: string | undefined) {
  const { innerHtml, isLoading } = useSourceDocxInner(docxUrl);
  return { html: innerHtml, isLoading };
}

/** @deprecated use useDocxInnerPreview */
export function useDocxHtmlPreview(
  docxUrl: string | undefined,
  tailoredText: string,
  sectionChanges: ResumeSectionChange[],
  enabled: boolean,
  debounceMs = 400,
) {
  const { innerHtml, isLoading } = useDocxInnerPreview(
    docxUrl,
    tailoredText,
    sectionChanges,
    enabled,
    debounceMs,
  );
  return { html: innerHtml, isLoading };
}
