import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { resolveStageId, stageLabel } from '@/lib/funnel/stage-config';
import type { AppointmentTipo } from '@/components/board/types';

/** Compromisso no formato do CEO Brain HTML original. */
export type LegacyAppointment = {
  tipo?: string;
  date?: string;
  time?: string;
  title?: string;
  local?: string;
  notes?: string;
  cumprido?: boolean;
};

/** Formato compatível com o CEO Brain HTML original. */
export type LegacyCard = {
  id: string;
  type: 'empresa' | 'cliente';
  name: string;
  fantasia?: string;
  cnpj?: string;
  cpf?: string;
  contact?: string;
  phone?: string;
  email?: string;
  municipio?: string;
  uf?: string;
  value?: number;
  column: string;
  note?: string;
  tier?: string;
  appointments?: LegacyAppointment[];
};

export type LegacyContactExport = {
  id: string;
  type: 'empresa' | 'cliente';
  name: string;
  fantasia?: string;
  cnpj?: string;
  cpf?: string;
  contact?: string;
  phone?: string;
  email?: string;
  municipio?: string;
  uf?: string;
  value?: number;
  column?: string;
  note?: string;
};

type ContactRow = {
  id: string;
  name: string;
  company: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  custom_fields: unknown;
};

type OppRow = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  description: string | null;
  custom_fields: unknown;
  contact: ContactRow | ContactRow[] | null;
};

function contactOne(raw: OppRow['contact']): ContactRow | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function parseContactCf(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {} as Record<string, string | undefined>;
  return raw as Record<string, string | undefined>;
}

function parseOppCf(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {} as { tier?: string; lead_source?: string };
  return raw as { tier?: string; lead_source?: string };
}

export function opportunityToLegacyCard(
  opp: OppRow,
  stageConfig: FunnelStageConfig[],
): LegacyCard {
  const c = contactOne(opp.contact);
  const cf = parseContactCf(c?.custom_fields);
  const oppCf = parseOppCf(opp.custom_fields);
  const isPJ = cf.tipo_pessoa !== 'pf' && (!!c?.cnpj || cf.tipo_pessoa === 'pj');

  return {
    id: opp.id,
    type: isPJ ? 'empresa' : 'cliente',
    name: c?.name?.trim() || opp.title,
    fantasia: c?.company?.trim() || undefined,
    cnpj: c?.cnpj?.replace(/\D/g, '') || undefined,
    cpf: cf.cpf?.replace(/\D/g, '') || undefined,
    contact: cf.contact_person?.trim() || c?.position?.trim() || undefined,
    phone: c?.phone?.trim() || undefined,
    email: c?.email?.trim() || undefined,
    municipio: cf.municipio?.trim() || undefined,
    uf: cf.uf?.trim().toUpperCase() || undefined,
    value: opp.value ?? 0,
    column: resolveStageId(opp.stage, stageConfig),
    note: opp.description?.trim() || undefined,
    tier: oppCf.tier || undefined,
    appointments: [],
  };
}

export function legacyCardToContactExport(card: LegacyCard): LegacyContactExport {
  return {
    id: card.id,
    type: card.type,
    name: card.name,
    fantasia: card.fantasia,
    cnpj: card.cnpj,
    cpf: card.cpf,
    contact: card.contact,
    phone: card.phone,
    email: card.email,
    municipio: card.municipio,
    uf: card.uf,
    value: card.value,
    column: card.column,
    note: card.note,
  };
}

export function legacyStageLabel(card: LegacyCard, stageConfig: FunnelStageConfig[]): string {
  return stageLabel(stageConfig, card.column);
}

export function resolveImportStage(
  stageConfig: FunnelStageConfig[],
  etapaOrColumn: string | undefined,
): string {
  const raw = (etapaOrColumn ?? '').trim();
  if (!raw) return stageConfig.find((s) => !s.hidden)?.id ?? stageConfig[0]?.id ?? 'LEADS';
  return resolveStageId(raw, stageConfig);
}

export function probabilityForStage(stageConfig: FunnelStageConfig[], stageId: string): number {
  const match = stageConfig.find((s) => s.id === stageId);
  return match?.prob ?? 50;
}

const LEGACY_APPT_TIPO: Record<string, AppointmentTipo> = {
  Reunião: 'reuniao',
  Ligação: 'ligacao',
  WhatsApp: 'whatsapp',
  'E-mail': 'email',
  Visita: 'visita',
  Proposta: 'proposta',
  'Follow-up': 'followup',
  Demonstração: 'demonstracao',
  Outro: 'outro',
};

export function mapLegacyAppointmentTipo(raw: string | undefined): AppointmentTipo {
  const trimmed = (raw ?? '').trim();
  if (LEGACY_APPT_TIPO[trimmed]) return LEGACY_APPT_TIPO[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [label, id] of Object.entries(LEGACY_APPT_TIPO)) {
    if (label.toLowerCase() === lower) return id;
  }
  return 'outro';
}

export function isLegacyAppointment(value: unknown): value is LegacyAppointment {
  if (!value || typeof value !== 'object') return false;
  const row = value as LegacyAppointment;
  return !!(row.date || row.time || row.tipo || row.title);
}
