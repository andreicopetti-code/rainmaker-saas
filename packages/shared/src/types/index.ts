export interface Appointment {
  date: string;
  time?: string;
  title?: string;
  cumprido?: boolean;
}

export interface Deal {
  id: number;
  type: 'empresa' | 'cliente';
  name: string;
  fantasia?: string;
  cnpj?: string;
  cpf?: string;
  nascimento?: string;
  contact?: string;
  tier?: 'P' | 'M' | 'G' | 'E';
  value: number;
  phone?: string;
  email?: string;
  municipio?: string;
  uf?: string;
  situacao?: string;
  column: string;
  note?: string;
  responsavel?: string;
  createdBy?: string;
  appointments?: Appointment[];
  lostReason?: string;
  deletedAt?: string;
}

export interface PipelineColumn {
  id: string;
  label: string;
  color: string;
  bg: string;
  text: string;
  prob: number;
  hint?: string;
}

export interface OrgData {
  cards: Deal[];
  columns: PipelineColumn[];
  agenda_events: unknown[];
  vendors: string[];
  goals: Record<string, number>;
  automations: unknown[];
  automations_log: unknown[];
}

export type MemberRole = 'admin' | 'member';
export type SubscriptionPlan = 'free' | 'pro' | 'team';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface PlanLimits {
  max_deals: number;
  max_members: number;
  cnpj_monthly: number;
  ai_monthly: number;
  automations_enabled: boolean;
}
