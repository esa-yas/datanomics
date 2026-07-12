import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { candidateService } from '@/services/candidateService';
import { applicationService } from '@/services/applicationService';
import { recruiterMessageService } from '@/services/recruiterMessageService';
import { weeklyReportService } from '@/services/weeklyReportService';
import { templateService } from '@/services/templateService';
import { staffImportService } from '@/services/staffImportService';
import { fetchDashboard, type DashboardData } from '@/services/dashboardService';
import { gmailSyncService, type GmailApplyMessage } from '@/services/gmailSyncService';
import { supabase } from '@/lib/supabase';
import { runSupabaseQuery } from '@/lib/fetchUtils';
import { useDataReady } from '@/hooks/useDataReady';
import { useAuthStore } from '@/stores/authStore';
import type { Application } from '@/types';
import type { Candidate } from '@/types';
import type { RecruiterMessage } from '@/types';
import type { WeeklyReport } from '@/types';
import type { Template } from '@/types';
import type { StaffDataImport } from '@/services/staffImportService';

function useAuthedQuery<T>(queryKey: readonly unknown[], queryFn: () => Promise<T>) {
  const ready = useDataReady();
  return useQuery({
    queryKey,
    queryFn: () => runSupabaseQuery(String(queryKey[0]), queryFn),
    enabled: ready,
    staleTime: 60_000,
    refetchOnMount: true,
  });
}

export function useDashboard() {
  const { user } = useAuthStore();
  return useAuthedQuery(
    [...queryKeys.dashboard, user?.id ?? '', user?.role ?? ''],
    () => fetchDashboard(),
  );
}

export function useCandidates() {
  return useAuthedQuery<Candidate[]>(queryKeys.candidates, () => candidateService.getList());
}

export function useCandidatesPicklist() {
  const ready = useDataReady();
  return useQuery({
    queryKey: queryKeys.candidatesPicklist,
    queryFn: () => runSupabaseQuery('candidates-picklist', () => candidateService.getPicklist()),
    enabled: ready,
    staleTime: 120_000,
    refetchOnMount: true,
  });
}

export function useCandidate(id: string | undefined) {
  const ready = useDataReady();
  return useQuery({
    queryKey: queryKeys.candidate(id ?? ''),
    queryFn: () => runSupabaseQuery('candidate', () => candidateService.getById(id!)),
    enabled: ready && !!id,
    refetchOnMount: true,
  });
}

export function useApplications() {
  return useAuthedQuery<Application[]>(queryKeys.applications, () => applicationService.getList());
}

export function useGmailApplyMessages() {
  return useAuthedQuery<GmailApplyMessage[]>(queryKeys.gmailApplyMessages, () =>
    gmailSyncService.listApplyMessages({ limit: 150 }),
  );
}

export function useMessages() {
  return useAuthedQuery<RecruiterMessage[]>(queryKeys.messages, () => recruiterMessageService.getList());
}

export function useReports() {
  return useAuthedQuery<WeeklyReport[]>(queryKeys.reports, () => weeklyReportService.getAll());
}

export type ResumeListRow = {
  id: string;
  candidate_id: string;
  version_name: string;
  version_number: number;
  type: string;
  job_title: string;
  summary: string;
  skills: string[];
  raw_text?: string;
  pdf_file_url?: string;
  docx_file_url?: string;
  match_score_before?: number;
  match_score_after?: number;
  is_active: boolean;
  created_at: string;
  candidates?: { full_name: string } | { full_name: string }[] | null;
};

export function useResumes() {
  const ready = useDataReady();
  return useQuery({
    queryKey: queryKeys.resumes,
    queryFn: () =>
      runSupabaseQuery('resumes', async () => {
        const { data, error } = await supabase
          .from('resumes')
          .select(
            'id, candidate_id, version_name, version_number, type, job_title, summary, skills, raw_text, pdf_file_url, docx_file_url, match_score_before, match_score_after, is_active, created_at, candidates(full_name)',
          )
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as ResumeListRow[];
      }),
    enabled: ready,
    staleTime: 60_000,
    refetchOnMount: true,
  });
}

export function useTemplates() {
  return useAuthedQuery<Template[]>(queryKeys.templates, () => templateService.getAll());
}

export function useStaffImports() {
  const { user } = useAuthStore();
  const ready = useDataReady();
  return useQuery({
    queryKey: [...queryKeys.staffImports, user?.id, user?.role],
    queryFn: () =>
      runSupabaseQuery('staff-imports', async () => {
        if (!user) return [] as StaffDataImport[];
        if (user.role === 'job_search_assistant') {
          const mine = await staffImportService.getMine(user.id);
          return mine ? [mine] : [];
        }
        return staffImportService.listAll();
      }),
    enabled: ready && !!user,
    staleTime: 60_000,
  });
}

export function useInvalidateData() {
  const qc = useQueryClient();
  return {
    addCandidate: (candidate: Candidate) => {
      qc.setQueryData<Candidate[]>(queryKeys.candidates, (old) => {
        const list = old ?? [];
        if (list.some((c) => c.id === candidate.id)) return list;
        return [candidate, ...list];
      });
      qc.invalidateQueries({ queryKey: queryKeys.candidatesPicklist });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    candidates: () => {
      qc.invalidateQueries({ queryKey: queryKeys.candidates });
      qc.invalidateQueries({ queryKey: queryKeys.candidatesPicklist });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    applications: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications });
      qc.invalidateQueries({ queryKey: queryKeys.gmailApplyMessages });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    messages: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    reports: () => qc.invalidateQueries({ queryKey: queryKeys.reports }),
    resumes: () => qc.invalidateQueries({ queryKey: queryKeys.resumes }),
    templates: () => qc.invalidateQueries({ queryKey: queryKeys.templates }),
    staffImports: () => qc.invalidateQueries({ queryKey: queryKeys.staffImports }),
    dashboard: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
    all: () => qc.invalidateQueries(),
  };
}
