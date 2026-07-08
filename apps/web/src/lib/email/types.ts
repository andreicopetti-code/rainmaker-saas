export type EmailFolder = 'inbox' | 'sent' | 'all' | 'templates';
export type EmailDirection = 'inbound' | 'outbound';
export type EmailProvider = 'none' | 'gmail' | 'emailjs' | 'resend';
export type EmailSendStatus = 'draft' | 'sent' | 'delivered' | 'failed' | 'received';

export type EmailTracking = {
  status?: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
};

export type EmailMessageRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  direction: EmailDirection;
  folder: 'inbox' | 'sent' | 'trash';
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  is_read: boolean;
  is_starred: boolean;
  opportunity_id: string | null;
  contact_id: string | null;
  external_id: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  send_status: EmailSendStatus;
  real_send: boolean;
  tracking: EmailTracking;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
};

export type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  sort_order: number;
};

export type EmailAccountSettings = {
  provider: EmailProvider;
  fromEmail: string | null;
  fromName: string | null;
  connected: boolean;
  lastSyncAt: string | null;
  emailjsConfigured: boolean;
};

export type EmailDealOption = {
  id: string;
  label: string;
  contactEmail: string | null;
};

export type EmailListItem = {
  id: string;
  direction: EmailDirection;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  preview: string;
  bodyText: string;
  isRead: boolean;
  sendStatus: EmailSendStatus;
  realSend: boolean;
  tracking: EmailTracking;
  opportunityId: string | null;
  dealLabel: string | null;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
};

export type EmailsPageData = {
  messages: EmailListItem[];
  templates: EmailTemplateRow[];
  settings: EmailAccountSettings;
  deals: EmailDealOption[];
  unreadCount: number;
};

export type EmailJsConfig = {
  fromEmail: string;
  serviceId: string;
  templateId: string;
  publicKey: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  opportunityId?: string | null;
  inReplyTo?: string | null;
};
