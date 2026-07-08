import type { PipelineColumn } from '../types';

export const DEFAULT_COLUMNS: PipelineColumn[] = [
  { id: 'LEADS', label: 'Leads', color: '#2563EB', bg: '#EFF6FF', text: '#1D4ED8', prob: 10, hint: 'Qualifique o lead' },
  { id: 'QUALIFICADO', label: 'Qualificado', color: '#D97706', bg: '#FFFBEB', text: '#92400E', prob: 25, hint: 'Agende uma reunião' },
  { id: 'REUNIÃO', label: 'Reunião', color: '#7C3AED', bg: '#F5F3FF', text: '#5B21B6', prob: 45, hint: 'Envie uma proposta' },
  { id: 'PROPOSTA_ENVIADA', label: 'Proposta', color: '#0891B2', bg: '#ECFEFF', text: '#0E7490', prob: 65, hint: 'Inicie a negociação' },
  { id: 'NEGOCIAÇÃO', label: 'Negociação', color: '#EA580C', bg: '#FFF7ED', text: '#9A3412', prob: 80, hint: 'Feche o contrato' },
  { id: 'GANHO', label: 'Ganho', color: '#16A34A', bg: '#F0FDF4', text: '#15803D', prob: 100, hint: 'Contrato fechado ✓' },
  { id: 'PERDIDO', label: 'Perdido', color: '#DC2626', bg: '#FEF2F2', text: '#B91C1C', prob: 0, hint: 'Registre o motivo' },
];

export const TIERS = [
  { id: 'P', label: 'Pequeno', desc: 'Até R$ 30k', color: '#5A6174', bg: '#F0F1F3', mid: 15000 },
  { id: 'M', label: 'Médio', desc: 'R$ 30k – R$ 100k', color: '#2477D4', bg: '#EBF3FD', mid: 65000 },
  { id: 'G', label: 'Grande', desc: 'R$ 100k – R$ 500k', color: '#C47D10', bg: '#FEF3DC', mid: 300000 },
  { id: 'E', label: 'Estratégico', desc: 'Acima de R$ 500k', color: '#1E8A4C', bg: '#E6F5EC', mid: 750000 },
] as const;

export * from './plans';

/** @deprecated Use LEGACY_PLAN_LIMITS ou features do plano no banco. */
export const PLAN_LIMITS = {
  free: {
    max_deals: 30,
    max_members: 1,
    cnpj_monthly: 3,
    ai_monthly: 30,
    automations_enabled: false,
  },
  pro: {
    max_deals: 500,
    max_members: 3,
    cnpj_monthly: 600,
    ai_monthly: 200,
    automations_enabled: true,
  },
  team: {
    max_deals: 99999,
    max_members: 15,
    cnpj_monthly: 2400,
    ai_monthly: 1000,
    automations_enabled: true,
  },
} as const;

export const EMPTY_ORG_DATA = {
  cards: [],
  columns: DEFAULT_COLUMNS,
  agenda_events: [],
  vendors: [],
  goals: {},
  automations: [],
  automations_log: [],
};
