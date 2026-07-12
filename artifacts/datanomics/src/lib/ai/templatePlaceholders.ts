/** Standard placeholders AI should use in generated message templates. */
export const STANDARD_PLACEHOLDERS = [
  'Name',
  'Role',
  'Company',
  'Recruiter Name',
  'Job Title',
  'Availability',
  'Salary Range',
  'Work Authorization',
] as const;

export const PLACEHOLDER_HINT = `Use square-bracket placeholders only (never real names or companies). Available: [Name], [Role], [Company], [Recruiter Name], [Job Title], [Availability], [Salary Range], [Work Authorization]. Use only placeholders that fit each template.`;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectBracketPlaceholders(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const m of text.match(/\[([^\]]+)\]/g) ?? []) {
      found.add(m.slice(1, -1).trim());
    }
  }
  return [...found];
}

export function fillBracketPlaceholders(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    out = out.replace(new RegExp(`\\[${escapeRegExp(key)}\\]`, 'gi'), value.trim());
  }
  return out;
}

export function fillTemplateText(text: string, values: Record<string, string>): string {
  let out = fillBracketPlaceholders(text, values);
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    out = out.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value.trim());
  }
  return out;
}

export const PLACEHOLDER_FIELD_HINTS: Record<string, string> = {
  Name: 'Candidate full name',
  Role: 'Target job title',
  Company: 'Hiring company',
  'Recruiter Name': 'Recruiter or hiring manager',
  'Job Title': 'Position title from the posting',
  Availability: 'Interview availability windows',
  'Salary Range': 'Expected compensation',
  'Work Authorization': 'Visa / work auth status',
};
