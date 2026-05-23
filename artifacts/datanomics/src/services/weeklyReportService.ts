import { supabase } from '../lib/supabase';
import { applicationService } from './applicationService';
import { recruiterMessageService } from './recruiterMessageService';
import type { WeeklyReport } from '../types';

export const weeklyReportService = {
  async generate(
    candidateId: string,
    candidateName: string,
    employeeId: string,
    managerId: string,
    aiNarrative?: string
  ) {
    const apps = await applicationService.getThisWeek(candidateId);
    const unread = await recruiterMessageService.getUnread();
    const candUnread = unread.filter((m) => m.candidate_id === candidateId);
    const replied = apps.filter((a) =>
      ['recruiter_replied', 'phone_screen', 'interview_scheduled', 'interview_done', 'final_round', 'offer'].includes(a.status)
    );
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);

    const { data, error } = await supabase
      .from('weekly_reports')
      .insert({
        candidate_id: candidateId,
        candidate_name: candidateName,
        week_start_date: weekStart.toISOString().split('T')[0],
        week_end_date: now.toISOString().split('T')[0],
        week_number: Math.ceil(
          (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000
        ),
        year: now.getFullYear(),
        applications_submitted: apps.length,
        recruiter_replies: replied.length,
        interviews_scheduled: apps.filter((a) =>
          ['interview_scheduled', 'interview_done', 'final_round'].includes(a.status)
        ).length,
        offers_received: apps.filter((a) => a.status === 'offer').length,
        resumes_tailored: apps.filter((a) => a.quality_resume_tailored).length,
        pending_messages: candUnread.length,
        response_rate: apps.length > 0 ? Math.round((replied.length / apps.length) * 100) : 0,
        top_companies: [...new Set(apps.map((a) => a.company))].slice(0, 5),
        top_roles: [...new Set(apps.map((a) => a.job_title))].slice(0, 5),
        ai_narrative: aiNarrative ?? '',
        employee_id: employeeId,
        manager_id: managerId,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WeeklyReport;
  },

  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('week_start_date', { ascending: false });
    if (error) throw error;
    return data as WeeklyReport[];
  },

  async getAll() {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .order('week_start_date', { ascending: false });
    if (error) throw error;
    return data as WeeklyReport[];
  },

  async markSent(id: string, emailedTo: string) {
    const { error } = await supabase
      .from('weekly_reports')
      .update({ sent_to_client: true, sent_at: new Date().toISOString(), emailed_to: emailedTo })
      .eq('id', id);
    if (error) throw error;
  },
};
