/* ── Contato / Empresa ──────────────────────────────────────────────────────── */
export type ContactData = {
  id?: string;
  name: string;          // razão social ou nome PF
  company?: string;      // nome fantasia
  cnpj?: string;
  email?: string;
  phone?: string;
  position?: string;     // cargo/função da pessoa de contato
  custom_fields?: {
    tipo_pessoa?: 'pj' | 'pf';
    cpf?: string;
    situacao?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    setor?: string;
    regime_tributario?: string;
    porte?: string;
    contact_person?: string;  // nome da pessoa de contato na empresa
  };
};

/* ── Opportunity ────────────────────────────────────────────────────────────── */
export type OpportunityCustomFields = {
  tier?: 'P' | 'M' | 'G' | 'E';
  lead_source?: string;
  /** Valor só será conhecido após fechamento / execução do trabalho. */
  value_deferred?: boolean;
};

export type OpportunityItem = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  probability: number | null;
  description: string | null;
  owner_id: string;
  contact_id: string | null;
  tags: string[] | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  custom_fields: OpportunityCustomFields | null;
  updated_at: string | null;
  sort_order: number | null;
  next_appointment?: NextAppointment | null;
  contact?: ContactData | null;
};

import type { FunnelStageConfig } from '@/lib/funnel/stage-config';

export type FunnelData = {
  id: string;
  name: string;
  stages: string[];
  stageConfig: FunnelStageConfig[];
  organizationId: string;
};

export type StageOption = { id: string; label: string };

/* ── Form ───────────────────────────────────────────────────────────────────── */
export type OpportunityFormData = {
  // Deal
  title: string;
  stage: string;
  value: string;
  description: string;
  tier?: 'P' | 'M' | 'G' | 'E';
  /** Quando true, valor em branco é intencional (não é falha de cadastro). */
  value_deferred?: boolean;
  probability?: number;
  expected_close_date?: string;
  lost_reason?: string;
  lead_source?: string;
  owner_id?: string;
  tags?: string[];
  // Contato
  contact_id?: string;
  contact_name?: string;         // razão social / nome PF
  contact_company?: string;      // nome fantasia
  contact_cnpj?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_person_name?: string;  // nome da pessoa de contato na empresa
  contact_position?: string;     // cargo/função da pessoa de contato
  contact_tipo_pessoa?: 'pj' | 'pf';
  contact_situacao?: string;
  contact_endereco?: string;
  contact_municipio?: string;
  contact_uf?: string;
  contact_cep?: string;
  contact_setor?: string;
  contact_regime_tributario?: string;
  contact_porte?: string;
};

/* ── Appointment ────────────────────────────────────────────────────────────── */
export type AppointmentTipo =
  | 'reuniao' | 'ligacao' | 'whatsapp' | 'email'
  | 'visita' | 'proposta' | 'followup' | 'demonstracao' | 'outro';

export type AppointmentInput = {
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  location?: string;
  note?: string;
};

export const APPOINTMENT_TIPOS: { id: AppointmentTipo; label: string }[] = [
  { id: 'reuniao',      label: 'Reunião' },
  { id: 'ligacao',      label: 'Ligação' },
  { id: 'whatsapp',     label: 'WhatsApp' },
  { id: 'email',        label: 'E-mail' },
  { id: 'visita',       label: 'Visita' },
  { id: 'proposta',     label: 'Proposta' },
  { id: 'followup',     label: 'Follow-up' },
  { id: 'demonstracao', label: 'Demonstração' },
  { id: 'outro',        label: 'Outro' },
];

export type Appointment = {
  id: string;
  opportunity_id: string;
  organization_id: string;
  created_by: string;
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  done: boolean;
  note: string | null;
  location: string | null;
  created_at: string;
};

/** Compact appointment data attached to each OpportunityItem for card display */
export type NextAppointment = {
  id: string;
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  done: boolean;
  location?: string | null;
  note?: string | null;
};

/* ── Org member ─────────────────────────────────────────────────────────────── */
export type OrgMember = {
  user_id: string;
  full_name: string | null;
  email?: string | null;
};

/* ── Constants ──────────────────────────────────────────────────────────────── */
export const LEAD_SOURCES = [
  'Indicação',
  'Site / Blog',
  'Cold Call',
  'LinkedIn',
  'Instagram',
  'Evento',
  'Consulta CNPJ',
  'Outros',
] as const;

export const SETORES = [
  'Indústria',
  'Comércio Varejista',
  'Comércio Atacadista',
  'Serviços B2B',
  'Saúde',
  'Educação',
  'Construção Civil',
  'Agronegócio',
  'Alimentação e Bebidas',
  'Logística e Transporte',
  'Hotelaria e Turismo',
  'Financeiro',
  'Tecnologia',
  'Imobiliário',
  'Entretenimento e Mídia',
  'Energia e Utilities',
  'Jurídico',
  'Outros',
] as const;

export const REGIMES_TRIBUTARIOS = [
  'MEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Lucro Arbitrado',
  'Imune / Isento',
] as const;

export const PORTES_EMPRESA = [
  'MEI (até R$ 81 mil/ano)',
  'Micro Empresa (até R$ 360 mil/ano)',
  'Pequena Empresa (até R$ 4,8 mi/ano)',
  'Média Empresa (até R$ 300 mi/ano)',
  'Grande Empresa (acima de R$ 300 mi/ano)',
] as const;
