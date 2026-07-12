export const queryKeys = {
  candidates: ['candidates'] as const,
  candidatesPicklist: ['candidates', 'picklist'] as const,
  candidate: (id: string) => ['candidates', id] as const,
  applications: ['applications'] as const,
  gmailApplyMessages: ['gmail-apply-messages'] as const,
  dashboard: ['dashboard'] as const,
  messages: ['messages'] as const,
  reports: ['reports'] as const,
  resumes: ['resumes'] as const,
  templates: ['templates'] as const,
  profiles: ['profiles'] as const,
  staffImports: ['staff-imports'] as const,
};
