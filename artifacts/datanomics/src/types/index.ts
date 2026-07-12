export type UserRole =
  | 'admin'
  | 'manager'
  | 'team_lead'
  | 'job_search_assistant'
  | 'resume_specialist'
  | 'email_specialist'
  | 'client';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  photo_url?: string;
  role: UserRole;
  status: UserStatus;
  phone_number?: string;
  timezone: string;
  weekly_target_applications: number;
  reply_sla_hours: number;
  created_by?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export type CandidateStatus =
  | 'lead'
  | 'resume_in_progress'
  | 'profile_setup'
  | 'application_started'
  | 'active_search'
  | 'interview_stage'
  | 'offer_received'
  | 'placed'
  | 'paused'
  | 'dropped';

export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type WorkAuth = 'USC' | 'GC' | 'H1B' | 'OPT' | 'CPT' | 'TN' | 'EAD' | 'Other';

export interface Candidate {
  id: string;
  full_name: string;
  email: string;
  email_password?: string;
  phone: string;
  whatsapp?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country: string;
  preferred_work_modes: WorkMode[];
  willing_to_relocate: boolean;
  preferred_states: string[];
  work_auth: WorkAuth;
  target_roles: string[];
  min_rate?: number;
  rate_type?: 'hourly' | 'annual';
  skills: string[];
  experience_years: number;
  status: CandidateStatus;
  total_applications: number;
  total_replies: number;
  total_interviews: number;
  total_offers: number;
  last_application_date?: string;
  last_reply_date?: string;
  last_interview_date?: string;
  primary_assignee_id?: string;
  application_specialist_id?: string;
  resume_specialist_id?: string;
  email_specialist_id?: string;
  manager_id?: string;
  placed_at?: string;
  placed_company?: string;
  placed_role?: string;
  placed_salary?: number;
  placed_salary_type?: string;
  tags: string[];
  notes: string;
  client_portal_enabled: boolean;
  job_research_enabled?: boolean;
  last_job_research_at?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus =
  | 'applied'
  | 'viewed'
  | 'recruiter_replied'
  | 'phone_screen'
  | 'interview_scheduled'
  | 'interview_done'
  | 'final_round'
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

export type JobSource =
  | 'linkedin'
  | 'dice'
  | 'indeed'
  | 'ziprecruiter'
  | 'glassdoor'
  | 'monster'
  | 'direct'
  | 'referral'
  | 'other';

export type PayType = 'hourly_w2' | 'hourly_c2c' | 'annual_salary';

export interface Application {
  id: string;
  candidate_id: string;
  candidate_name: string;
  applied_by: string;
  applied_by_name: string;
  job_title: string;
  company: string;
  city?: string;
  state?: string;
  work_mode: WorkMode;
  job_source: JobSource;
  job_url?: string;
  job_description?: string;
  pay_rate?: number;
  pay_type?: PayType;
  resume_version_id?: string;
  resume_version_name?: string;
  cover_letter_used: boolean;
  status: ApplicationStatus;
  recruiter_name?: string;
  recruiter_email?: string;
  recruiter_phone?: string;
  recruiter_company?: string;
  applied_at: string;
  first_reply_at?: string;
  last_activity_at: string;
  next_follow_up_date?: string;
  interview_date?: string;
  offer_date?: string;
  offer_amount?: number;
  ai_match_score?: number;
  missing_keywords: string[];
  quality_resume_tailored: boolean;
  quality_location_verified: boolean;
  quality_salary_verified: boolean;
  quality_auth_verified: boolean;
  quality_duplicate_checked: boolean;
  quality_notes_added: boolean;
  quality_score: number;
  notes: string;
  flagged: boolean;
  flag_reason?: string;
  created_at: string;
  updated_at: string;
}

export type ResumeType = 'base' | 'tailored' | 'draft';

export interface ResumeExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface Resume {
  id: string;
  candidate_id: string;
  version_name: string;
  version_number: number;
  type: ResumeType;
  job_title: string;
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  certifications: string[];
  docx_file_url?: string;
  pdf_file_url?: string;
  raw_text?: string;
  tailored_for_job_title?: string;
  tailored_for_company?: string;
  tailored_application_id?: string;
  jd_snapshot?: string;
  match_score_before?: number;
  match_score_after?: number;
  added_keywords: string[];
  ai_model_used?: string;
  tailored_at?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageChannel = 'email' | 'linkedin' | 'phone';
export type MessageStatus = 'unread' | 'read' | 'replied' | 'ignored' | 'action_needed';
export type MessagePriority = 'high' | 'normal' | 'low';

export interface RecruiterMessage {
  id: string;
  candidate_id: string;
  application_id?: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject?: string;
  body: string;
  from_address?: string;
  to_address?: string;
  status: MessageStatus;
  priority: MessagePriority;
  replied_at?: string;
  replied_by?: string;
  ai_reply?: string;
  actual_reply?: string;
  assigned_to: string;
  received_at: string;
  created_at: string;
}

export interface WeeklyReport {
  id: string;
  candidate_id: string;
  candidate_name: string;
  week_start_date: string;
  week_end_date: string;
  week_number: number;
  year: number;
  applications_submitted: number;
  recruiter_replies: number;
  interviews_scheduled: number;
  offers_received: number;
  resumes_tailored: number;
  follow_ups_sent: number;
  pending_messages: number;
  response_rate: number;
  top_companies: string[];
  top_roles: string[];
  highlights: string[];
  next_week_focus: string[];
  ai_narrative?: string;
  generated_by: 'auto' | 'manual';
  sent_to_client: boolean;
  sent_at?: string;
  emailed_to?: string;
  employee_id?: string;
  manager_id?: string;
  created_at: string;
}

export type TemplateCategory =
  | 'recruiter_reply'
  | 'follow_up'
  | 'interview_availability'
  | 'salary_answer'
  | 'work_auth_answer'
  | 'relocation_answer'
  | 'rejection_followup'
  | 'application_form'
  | 'client_update';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  subject?: string;
  body: string;
  variables: string[];
  is_global: boolean;
  usage_count: number;
  created_by: string;
  created_at: string;
}

export interface CandidateNote {
  id: string;
  candidate_id: string;
  content: string;
  author_id: string;
  author_name: string;
  pinned: boolean;
  created_at: string;
}

export interface FollowUp {
  id: string;
  candidate_id: string;
  application_id?: string;
  due_date: string;
  description: string;
  assigned_to: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  status: ApplicationStatus;
  changed_at: string;
  changed_by: string;
  changed_by_name: string;
  note?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  read: boolean;
  link?: string;
  created_at: string;
}

export interface SystemSettings {
  id: string;
  active_ai_provider: 'gemini' | 'openai' | 'anthropic';
  daily_application_target: number;
  weekly_application_target: number;
  reply_sla_hours: number;
  quality_score_threshold: number;
  weekly_report_auto_send: boolean;
  weekly_report_day_of_week: number;
  updated_at: string;
  updated_by?: string;
}

export interface DashboardStats {
  totalCandidates: number;
  activeCandidates: number;
  placedCandidates: number;
  totalApplicationsThisWeek: number;
  totalRepliesThisWeek: number;
  totalInterviewsThisWeek: number;
  totalOffers: number;
  avgQualityScore: number;
  avgResponseRate: number;
  pendingMessages: number;
  flaggedApplications: number;
}
