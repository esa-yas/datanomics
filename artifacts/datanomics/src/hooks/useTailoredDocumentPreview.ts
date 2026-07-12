import { useEffect, useRef, useState } from 'react';
import {
  buildTailoredDocxFromSource,
  buildTailoredPdfOnly,
} from '@/lib/resume/exportTailored';
import { docxBufferToInnerHtml } from '@/lib/resume/extractResumeContent';
import type { DocxSkillsValidation } from '@/lib/resume/docxSkillsPatch';
import type { DocxSummaryValidation } from '@/lib/resume/docxSummaryPatch';
import type { DocxTitleValidation } from '@/lib/resume/docxTitlePatch';
import type { ResumeLine } from '@/lib/resume/resumeLines';
import type { SourceResumeSnapshot } from '@/lib/resume/sourceResumeSnapshot';
import { isValidSourceSnapshot } from '@/lib/resume/sourceResumeSnapshot';
import type { ResumeSectionChange, TailorResult } from '@/lib/utils/resumeTailor';

interface PreviewState {
  pdfUrl: string | null;
  pdfBlob: Blob | null;
  docxBlob: Blob | null;
  docxInnerHtml: string | null;
  docxSummaryValidation: DocxSummaryValidation | null;
  docxSkillsValidation: DocxSkillsValidation | null;
  docxTitleValidation: DocxTitleValidation | null;
  isGenerating: boolean;
  isDocxReady: boolean;
  isPdfReady: boolean;
  error: string | null;
}

export function useTailoredDocumentPreview(
  tailoredText: string,
  sectionChanges: ResumeSectionChange[],
  sourceDocxUrl?: string,
  originalLines?: ResumeLine[],
  tailorResult?: Pick<TailorResult, 'optimizedSummary' | 'suggestedTitle' | 'sectionChanges'>,
  originalText?: string,
  jdText?: string,
  sourceSnapshot?: SourceResumeSnapshot,
  debounceMs = 200,
): PreviewState {
  const [state, setState] = useState<PreviewState>({
    pdfUrl: null,
    pdfBlob: null,
    docxBlob: null,
    docxInnerHtml: null,
    docxSummaryValidation: null,
    docxSkillsValidation: null,
    docxTitleValidation: null,
    isGenerating: false,
    isDocxReady: false,
    isPdfReady: false,
    error: null,
  });
  const revokeRef = useRef<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!tailoredText.trim()) {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
      setState({
        pdfUrl: null,
        pdfBlob: null,
        docxBlob: null,
        docxInnerHtml: null,
        docxSummaryValidation: null,
        docxSkillsValidation: null,
        docxTitleValidation: null,
        isGenerating: false,
        isDocxReady: false,
        isPdfReady: false,
        error: null,
      });
      return;
    }

    if (!sourceSnapshot || !isValidSourceSnapshot(sourceSnapshot)) {
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        isDocxReady: false,
        isPdfReady: false,
        error: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isGenerating: true, error: null }));
    const timer = setTimeout(async () => {
      const id = ++requestId.current;
      try {
        const { blob: docxBlob, summaryValidation, skillsValidation, titleValidation } = await buildTailoredDocxFromSource(
          sourceDocxUrl,
          sectionChanges,
          tailoredText,
          originalText,
          tailorResult?.optimizedSummary,
          tailorResult?.suggestedTitle,
          jdText,
          sourceSnapshot,
        );
        if (id !== requestId.current) return;

        let docxInnerHtml: string | null = null;
        try {
          docxInnerHtml = await docxBufferToInnerHtml(await docxBlob.arrayBuffer());
        } catch {
          docxInnerHtml = null;
        }
        if (id !== requestId.current) return;

        setState((prev) => ({
          ...prev,
          docxBlob,
          docxInnerHtml,
          docxSummaryValidation: summaryValidation ?? null,
          docxSkillsValidation: skillsValidation ?? null,
          docxTitleValidation: titleValidation ?? null,
          isDocxReady: true,
        }));

        const pdfBlob = await buildTailoredPdfOnly(tailoredText, originalLines, tailorResult);
        if (id !== requestId.current) return;

        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
        const pdfUrl = URL.createObjectURL(pdfBlob);
        revokeRef.current = pdfUrl;

        setState({
          pdfUrl,
          pdfBlob,
          docxBlob,
          docxInnerHtml,
          docxSummaryValidation: summaryValidation ?? null,
          docxSkillsValidation: skillsValidation ?? null,
          docxTitleValidation: titleValidation ?? null,
          isGenerating: false,
          isDocxReady: true,
          isPdfReady: true,
          error: null,
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: err instanceof Error ? err.message : 'Could not build preview',
        }));
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [tailoredText, sourceDocxUrl, originalText, jdText, sourceSnapshot, debounceMs, JSON.stringify(sectionChanges), originalLines, tailorResult]);

  useEffect(
    () => () => {
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    },
    [],
  );

  return state;
}
