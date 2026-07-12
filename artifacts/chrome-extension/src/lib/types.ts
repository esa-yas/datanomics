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

export type Platform = 'linkedin' | 'gmail' | 'indeed' | 'unknown';

export interface ExtractedConversation {
  platform: Platform;
  conversation: string;
  subject?: string;
  url: string;
  capturedAt: string;
}

export type MessageType =
  | 'CONVERSATION_CAPTURED'
  | 'GET_STORED_CONVERSATION'
  | 'REQUEST_EXTRACT'
  | 'OPEN_SIDE_PANEL';

export interface ExtensionMessage {
  type: MessageType;
  payload?: ExtractedConversation | { tabId?: number };
}
