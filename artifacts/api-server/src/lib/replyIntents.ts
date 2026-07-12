export type ReplyIntent =
  | 'interested'
  | 'not_interested'
  | 'need_more_info'
  | 'schedule_interview'
  | 'salary_rates'
  | 'work_authorization'
  | 'follow_up'
  | 'polite_decline'
  | 'referral';

export interface ReplyIntentOption {
  value: ReplyIntent;
  label: string;
  description: string;
}

export const REPLY_INTENT_OPTIONS: ReplyIntentOption[] = [
  { value: 'interested', label: 'Interested', description: 'Express interest and ask to move forward' },
  { value: 'not_interested', label: 'Not interested', description: 'Politely decline this opportunity' },
  { value: 'need_more_info', label: 'Need more information', description: 'Ask about role, team, comp, or process' },
  { value: 'schedule_interview', label: 'Schedule interview', description: 'Share availability or confirm a time' },
  { value: 'salary_rates', label: 'Salary / rates', description: 'Discuss compensation professionally' },
  { value: 'work_authorization', label: 'Work authorization', description: 'Clarify visa or work auth status' },
  { value: 'follow_up', label: 'Follow up', description: 'Check in on a pending thread' },
  { value: 'polite_decline', label: 'Polite decline (wrong fit)', description: 'Decline but keep the door open' },
  { value: 'referral', label: 'Refer elsewhere', description: 'Ask about other matching roles' },
];

export const ALL_REPLY_INTENTS: ReplyIntent[] = REPLY_INTENT_OPTIONS.map((o) => o.value);

export interface RecruiterReplyContext {
  conversation: string;
  candidateName: string;
  targetRole: string;
  workAuth: string;
  channel?: string;
  subject?: string;
  extraNotes?: string;
}

export interface GeneratedReply {
  subject?: string;
  body: string;
}
