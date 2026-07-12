import { buildFormattedHeaderUpdate } from '@/lib/resume/resumeHeaderFormat';
import { getResumeHeadline } from '@/lib/resume/resumeStructure';
import type { ResumeSectionChange } from '@/lib/utils/resumeTailor';
import { extractSummaryText } from '@/lib/utils/resumeTailor';

const BULLET_START = /^([•\-\–*●▪◦‣▸►])\s*(.*)$/;

export type ResumeBlockType =
  | 'name'
  | 'headline'
  | 'contact'
  | 'section'
  | 'bullet'
  | 'paragraph'
  | 'skills'
  | 'blank';

export interface ResumeBlock {
  type: ResumeBlockType;
  text: string;
  lineIndex: number;
}

const SECTION_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|CERTIFICATIONS|PROJECTS|AWARDS|ACHIEVEMENTS|LEADERSHIP)$/i;

const BULLET_RE = /^[•\-\–*●▪◦]\s*(.+)$/;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 55) return false;
  if (SECTION_RE.test(t)) return true;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && !t.includes('@') && !t.includes('|');
}

function isContactLine(line: string, index: number): boolean {
  if (index > 6) return false;
  return (
    line.includes('@') ||
    line.includes('|') ||
    /linkedin|github|portfolio|www\./i.test(line) ||
    /\(\d{3}\)|\+\d|\d{3}[\-.]\d{3}/.test(line)
  );
}

function isSkillsLine(line: string, prevType?: ResumeBlockType): boolean {
  const t = line.trim();
  if (/^skills?\s*[:]/i.test(t)) return true;
  if (prevType === 'section' && /^skills/i.test(t)) return true;
  const parts = t.split(/[,|·•]/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 5 && t.length < 260 && !isSectionHeading(t);
}

/** Parse plain resume text into styled layout blocks. */
export function parseResumeToBlocks(text: string): ResumeBlock[] {
  const lines = text.split('\n');
  const blocks: ResumeBlock[] = [];
  let prevType: ResumeBlockType | undefined;
  let headerLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      blocks.push({ type: 'blank', text: '', lineIndex: i });
      prevType = 'blank';
      continue;
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1].trim(), lineIndex: i });
      prevType = 'bullet';
      continue;
    }

    if (/^\s{2,}\S/.test(raw) && prevType && ['bullet', 'paragraph', 'section'].includes(prevType)) {
      blocks.push({ type: 'bullet', text: trimmed, lineIndex: i });
      prevType = 'bullet';
      continue;
    }

    if (isSectionHeading(trimmed)) {
      blocks.push({ type: 'section', text: trimmed.toUpperCase(), lineIndex: i });
      prevType = 'section';
      continue;
    }

    if (headerLines === 0) {
      blocks.push({ type: 'name', text: trimmed, lineIndex: i });
      headerLines++;
      prevType = 'name';
      continue;
    }

    if (headerLines === 1 && !isSectionHeading(trimmed) && trimmed.length < 130) {
      blocks.push({ type: 'headline', text: trimmed, lineIndex: i });
      headerLines++;
      prevType = 'headline';
      continue;
    }

    if (isContactLine(trimmed, i)) {
      blocks.push({ type: 'contact', text: trimmed, lineIndex: i });
      prevType = 'contact';
      continue;
    }

    if (isSkillsLine(trimmed, prevType)) {
      const skillText = trimmed.replace(/^skills?\s*[:]\s*/i, '');
      blocks.push({ type: 'skills', text: skillText, lineIndex: i });
      prevType = 'skills';
      continue;
    }

    blocks.push({ type: 'paragraph', text: trimmed, lineIndex: i });
    prevType = 'paragraph';
  }

  return blocks;
}

export function parseSkillItems(text: string): string[] {
  return text
    .split(/[,|·•]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);
}

export const THINKING_BUBBLES = [
  'Reading how recruiters scan this role in 6 seconds…',
  'Mapping your wins to what this job actually asks for…',
  'Thinking about which keywords ATS filters need…',
  'Trying to see your resume through a hiring manager’s eyes…',
  'Finding the strongest proof points to lead with…',
  'Checking which bullets need metrics and impact…',
  'Making your match score impossible to ignore…',
  'Aligning your headline with the job title…',
  'Polishing language so it sounds senior, not generic…',
  'Preparing edits you can watch happen live…',
];

export function thinkingBubbleForChange(change: ResumeSectionChange): string {
  const label = (change.label || '').toLowerCase();
  if (label.includes('summary')) return 'Sharpening your professional summary for recruiters…';
  if (label.includes('skill')) return 'Tuning skills so ATS and recruiters both say yes…';
  if (label.includes('title') || label.includes('headline')) return 'Updating your headline to mirror the role…';
  if (label.includes('experience') || label.includes('bullet') || label.includes('work'))
    return 'Rewriting this bullet — action verb + impact…';
  if (label.includes('education')) return 'Tightening education section formatting…';
  return `Improving ${change.label || 'this section'} — watch the right side…`;
}

export function buildRevealPlan(
  result: {
    sectionChanges: ResumeSectionChange[];
    optimizedSummary?: string;
    suggestedTitle?: string;
    optimizedSkills?: string[];
  },
  originalText?: string,
): { change: ResumeSectionChange; bubble: string }[] {
  const steps: { change: ResumeSectionChange; bubble: string }[] = [];

  if (result.optimizedSummary?.trim() && originalText) {
    const summaryOriginal = extractSummaryText(originalText);
    if (summaryOriginal && summaryOriginal !== result.optimizedSummary.trim()) {
      steps.push({
        change: {
          label: 'Professional Summary',
          original: summaryOriginal,
          tailored: result.optimizedSummary.trim(),
        },
        bubble: 'Sharpening your professional summary for recruiters…',
      });
    }
  }

  for (const change of result.sectionChanges) {
    steps.push({
      change,
      bubble: thinkingBubbleForChange(change),
    });
  }

  if (result.suggestedTitle?.trim() && originalText) {
    const headline = getResumeHeadline(originalText);
    const formatted = buildFormattedHeaderUpdate(originalText, result.suggestedTitle);
    if (headline && formatted && headline !== formatted.headlineLine) {
      steps.push({
        change: {
          label: 'Title',
          original: headline,
          tailored: formatted.headlineLine,
        },
        bubble: 'Updating your headline to mirror the role…',
      });
    }
    if (formatted?.contactLine && formatted.contactIdx !== null) {
      const lines = originalText.split('\n');
      const origContact = lines[formatted.contactIdx]?.trim() || '';
      if (origContact && origContact !== formatted.contactLine) {
        steps.push({
          change: {
            label: 'Contact',
            original: origContact,
            tailored: formatted.contactLine,
          },
          bubble: 'Keeping location on your contact line…',
        });
      }
    }
  }

  return steps.filter((s) => s.change.original?.trim() && s.change.tailored?.trim());
}
