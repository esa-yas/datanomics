/** Minimal HTML wrapper so mammoth body keeps bullets without flattening the header. */

export interface SplitResumeHtml {
  headerHtml: string;
  bodyHtml: string;
}

const SECTION_START =
  /^(PROFESSIONAL SUMMARY|SUMMARY|EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|CERTIFICATIONS|PROJECTS)/i;
const SECTION_KEYWORD_RE =
  /\b(SUMMARY|SKILLS?|EXPERIENCE|EMPLOYMENT|EDUCATION|CERTIFICATIONS?|PROJECTS?|AWARDS?|COMPETENCIES|QUALIFICATIONS|PROFILE|OBJECTIVE)\b/i;

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 55) return false;
  if (SECTION_START.test(t)) return true;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && SECTION_KEYWORD_RE.test(t) && !t.includes('@');
}

export function splitMammothHtml(innerHtml: string): SplitResumeHtml {
  if (!innerHtml.trim()) {
    return { headerHtml: '', bodyHtml: '' };
  }

  if (typeof DOMParser === 'undefined') {
    return { headerHtml: '', bodyHtml: innerHtml };
  }

  const doc = new DOMParser().parseFromString(`<div id="resume-root">${innerHtml}</div>`, 'text/html');
  const root = doc.getElementById('resume-root');
  if (!root) {
    return { headerHtml: '', bodyHtml: innerHtml };
  }

  const children = Array.from(root.children);
  let splitAt = Math.min(children.length, 4);

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const tag = el.tagName?.toLowerCase();
    const text = el.textContent?.replace(/\s+/g, ' ').trim() || '';

    if (tag === 'ul' || tag === 'ol') {
      splitAt = i;
      break;
    }
    if (i >= 2 && isSectionHeading(text)) {
      splitAt = i;
      break;
    }
    if (i >= 5) {
      splitAt = i;
      break;
    }
  }

  const headerNodes = children.slice(0, splitAt);
  const bodyNodes = children.slice(splitAt);

  return {
    headerHtml: headerNodes.map((n) => n.outerHTML).join(''),
    bodyHtml: bodyNodes.map((n) => n.outerHTML).join(''),
  };
}

const RESUME_DOC_CSS = `
  .resume-docx-outer { background: #ffffff; min-height: 100%; color: #000000; }
  .resume-docx-page { max-width: 816px; margin: 0 auto; padding: 48px 56px; font-family: 'Times New Roman', Times, serif; color: #000000; }
  .resume-docx-body .resume-header-original { margin-bottom: 12pt; }
  .resume-docx-body .resume-header-original p,
  .resume-docx-body .resume-header-original h1,
  .resume-docx-body .resume-header-original h2,
  .resume-docx-body .resume-header-original h3 { margin: 0 0 4pt 0; font-size: inherit; font-weight: inherit; }
  .resume-docx-body .resume-header-original strong,
  .resume-docx-body .resume-header-original b { font-weight: 700; }
  .resume-docx-body .resume-body-content p { margin: 0 0 6pt 0; font-size: 11pt; }
  .resume-docx-body .resume-body-content ul { margin: 0 0 6pt 0; padding-left: 24pt; }
  .resume-docx-body .resume-body-content ol { margin: 0 0 6pt 0; padding-left: 24pt; }
  .resume-docx-body .resume-body-content li { margin: 0 0 3pt 0; }
`;

export function wrapFullResumeHtml(split: SplitResumeHtml): string {
  const body = `<div class="resume-docx-body"><div class="resume-header-original">${split.headerHtml}</div><div class="resume-body-content">${split.bodyHtml}</div></div>`;
  return `<style>${RESUME_DOC_CSS}</style><div class="resume-docx-outer"><div class="resume-docx-page">${body}</div></div>`;
}

export function wrapMammothInnerHtml(innerHtml: string): string {
  return wrapFullResumeHtml(splitMammothHtml(innerHtml));
}
