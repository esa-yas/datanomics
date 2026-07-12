import type { UserRole } from '@/types';

export function canAddCandidates(role: UserRole | undefined): boolean {
  return !!role && role !== 'job_search_assistant';
}

export function canConnectGmail(role: UserRole | undefined): boolean {
  return !!role && role !== 'job_search_assistant';
}

export function canGenerateBulkTemplates(role: UserRole | undefined): boolean {
  return !!role && role !== 'job_search_assistant';
}

export function canAccessReports(role: UserRole | undefined): boolean {
  return !!role && role !== 'job_search_assistant';
}

export function canAccessTeam(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canAccessSettings(role: UserRole | undefined): boolean {
  return role === 'admin';
}

export function canManageCandidateAssignments(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function isAssigneeScopedRole(role: UserRole | undefined): boolean {
  return role === 'job_search_assistant';
}

export function canCreateTemplates(role: UserRole | undefined): boolean {
  return canGenerateBulkTemplates(role);
}
