'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { buildScheduledAt, normalizeScheduledAt } from '@/lib/appointments/datetime';
import { parseStageConfig } from '@/lib/funnel/stage-config';
import {
  cardsToCsv,
  csvRowToLegacyCard,
  dateTag,
  parseCardsFromCsv,
  withBom,
} from '@/lib/import-export/csv';
import {
  isLegacyAppointment,
  legacyCardToContactExport,
  mapLegacyAppointmentTipo,
  opportunityToLegacyCard,
  probabilityForStage,
  resolveImportStage,
  type LegacyAppointment,
  type LegacyCard,
} from '@/lib/import-export/legacy-card';

export type ExportPayload = {
  content: string;
  filename: string;
  mime: string;
};

export type ImportMode = 'replace' | 'merge';

export type ImportResult = {
  imported: number;
  skipped: number;
};

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: funnel, error } = await (supabase as any)
    .from('funnels')
    .select('id, stages, stage_config')
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!funnel) throw new Error('Nenhum funil encontrado');

  const stageConfig = parseStageConfig(funnel.stage_config, funnel.stages);

  return { supabase, user, org, funnel, stageConfig };
}

async function loadLegacyCards(): Promise<{ cards: LegacyCard[]; stageConfig: Awaited<ReturnType<typeof getAuthContext>>['stageConfig'] }> {
  const { supabase, org, funnel, stageConfig } = await getAuthContext();

  const { data: rows, error } = await supabase
    .from('opportunities')
    .select(`
      id, title, stage, value, description, custom_fields,
      contact:contacts(id, name, company, cnpj, email, phone, position, custom_fields)
    `)
    .eq('funnel_id', funnel.id)
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const cards = (rows ?? []).map((row) =>
    opportunityToLegacyCard(row as Parameters<typeof opportunityToLegacyCard>[0], stageConfig),
  );

  return { cards, stageConfig };
}

export async function exportNegociacoes(format: 'json' | 'csv'): Promise<ExportPayload> {
  const { cards, stageConfig } = await loadLegacyCards();
  const tag = dateTag();

  if (format === 'json') {
    return {
      content: JSON.stringify({ version: 1, exported: new Date().toISOString(), cards }, null, 2),
      filename: `negociacoes_${tag}.json`,
      mime: 'application/json',
    };
  }

  return {
    content: withBom(cardsToCsv(cards, stageConfig)),
    filename: `negociacoes_${tag}.csv`,
    mime: 'text/csv;charset=utf-8',
  };
}

export async function exportContatos(format: 'json' | 'csv'): Promise<ExportPayload> {
  const { cards, stageConfig } = await loadLegacyCards();
  const contatos = cards.map(legacyCardToContactExport);
  const tag = dateTag();

  if (format === 'json') {
    return {
      content: JSON.stringify({ version: 1, exported: new Date().toISOString(), contatos }, null, 2),
      filename: `contatos_${tag}.json`,
      mime: 'application/json',
    };
  }

  return {
    content: withBom(cardsToCsv(cards, stageConfig)),
    filename: `contatos_${tag}.csv`,
    mime: 'text/csv;charset=utf-8',
  };
}

function parseImportedCards(text: string, filename: string): LegacyCard[] {
  const isCsv = filename.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const rows = parseCardsFromCsv(text);
    return rows
      .map((row, i) => csvRowToLegacyCard(row, i))
      .filter((c) => c.name.trim());
  }

  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed as LegacyCard[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { cards?: LegacyCard[]; contatos?: LegacyCard[] };
    const list = obj.cards ?? obj.contatos ?? [];
    return list.filter((c) => c?.name?.trim());
  }

  return [];
}

function cardTitle(card: LegacyCard): string {
  return card.fantasia?.trim() || card.name.trim();
}

function parseLegacyAppointments(card: LegacyCard): LegacyAppointment[] {
  if (!Array.isArray(card.appointments)) return [];
  return card.appointments.filter(isLegacyAppointment);
}

function legacyAppointmentScheduledAt(appt: LegacyAppointment): string | null {
  const date = appt.date?.trim();
  if (!date) return null;
  const time = appt.time?.trim() || '09:00';
  return normalizeScheduledAt(buildScheduledAt(date, time));
}

async function insertLegacyAppointments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  opportunityId: string,
  appointments: LegacyAppointment[],
): Promise<number> {
  if (!appointments.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apptTable = (supabase as any).from('appointments');
  let inserted = 0;

  for (const appt of appointments) {
    const scheduledAt = legacyAppointmentScheduledAt(appt);
    if (!scheduledAt) continue;

    const title = appt.title?.trim() || mapLegacyAppointmentTipo(appt.tipo);
    const { error } = await apptTable.insert({
      opportunity_id: opportunityId,
      organization_id: orgId,
      created_by: userId,
      tipo: mapLegacyAppointmentTipo(appt.tipo),
      title,
      scheduled_at: scheduledAt,
      location: appt.local?.trim() || null,
      note: appt.notes?.trim() || null,
      done: !!appt.cumprido,
    });

    if (error) throw new Error(error.message);
    inserted++;
  }

  return inserted;
}

async function insertLegacyCard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  funnelId: string,
  stageConfig: Awaited<ReturnType<typeof getAuthContext>>['stageConfig'],
  card: LegacyCard,
): Promise<void> {
  const stageId = resolveImportStage(stageConfig, card.column);
  const isPJ = card.type === 'empresa';

  const contactPayload = {
    organization_id: orgId,
    name: card.name.trim() || cardTitle(card),
    company: card.fantasia?.trim() || null,
    cnpj: card.cnpj?.replace(/\D/g, '') || null,
    email: card.email?.trim() || null,
    phone: card.phone?.trim() || null,
    position: card.contact?.trim() || null,
    created_by: userId,
    custom_fields: {
      tipo_pessoa: isPJ ? 'pj' : 'pf',
      cpf: card.cpf?.replace(/\D/g, '') || null,
      contact_person: card.contact?.trim() || null,
      municipio: card.municipio?.trim() || null,
      uf: card.uf?.trim().toUpperCase() || null,
    },
  };

  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .insert(contactPayload)
    .select('id')
    .single();

  if (contactErr || !contact) throw new Error(contactErr?.message ?? 'Falha ao criar contato');

  const oppPayload = {
    funnel_id: funnelId,
    organization_id: orgId,
    title: cardTitle(card),
    stage: stageId,
    value: card.value && card.value > 0 ? card.value : null,
    probability: probabilityForStage(stageConfig, stageId),
    description: card.note?.trim() || null,
    owner_id: userId,
    contact_id: contact.id,
    custom_fields: {
      tier: card.tier ?? null,
      lead_source: null,
    },
  };

  const { data: created, error: oppErr } = await supabase
    .from('opportunities')
    .insert(oppPayload)
    .select('id')
    .single();
  if (oppErr || !created) throw new Error(oppErr?.message ?? 'Falha ao criar deal');

  await insertLegacyAppointments(
    supabase,
    orgId,
    userId,
    created.id,
    parseLegacyAppointments(card),
  );
}

async function softDeleteAllDeals(orgId: string, funnelId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: opps, error: listErr } = await supabase
    .from('opportunities')
    .select('id, contact_id')
    .eq('organization_id', orgId)
    .eq('funnel_id', funnelId)
    .is('deleted_at', null);

  if (listErr) throw new Error(listErr.message);

  for (const opp of opps ?? []) {
    const { error } = await sb.rpc('soft_delete_opportunity', {
      p_id: opp.id,
      p_org_id: orgId,
    });
    if (error) throw new Error(error.message);
  }

  const contactIds = [...new Set((opps ?? []).map((o) => o.contact_id).filter(Boolean))] as string[];
  if (contactIds.length) {
    const { error: contactErr } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', contactIds)
      .eq('organization_id', orgId);
    if (contactErr) throw new Error(contactErr.message);
  }
}

export async function importNegociacoes(
  fileText: string,
  filename: string,
  mode: ImportMode,
): Promise<ImportResult> {
  const cards = parseImportedCards(fileText, filename);
  if (!cards.length) throw new Error('Nenhum registro encontrado no arquivo.');

  const { supabase, user, org, funnel, stageConfig } = await getAuthContext();

  if (mode === 'replace') {
    await softDeleteAllDeals(org.organization_id, funnel.id);
    for (const card of cards) {
      await insertLegacyCard(supabase, org.organization_id, user.id, funnel.id, stageConfig, card);
    }
    revalidatePaths();
    return { imported: cards.length, skipped: 0 };
  }

  const { data: existing } = await supabase
    .from('opportunities')
    .select('id')
    .eq('organization_id', org.organization_id)
    .eq('funnel_id', funnel.id)
    .is('deleted_at', null);

  const existIds = new Set((existing ?? []).map((o) => o.id));
  let imported = 0;
  let skipped = 0;

  for (const card of cards) {
    if (card.id && existIds.has(card.id)) {
      skipped++;
      continue;
    }
    await insertLegacyCard(supabase, org.organization_id, user.id, funnel.id, stageConfig, card);
    imported++;
  }

  revalidatePaths();
  return { imported, skipped };
}

export async function importContatos(
  fileText: string,
  filename: string,
  mode: ImportMode,
): Promise<ImportResult> {
  return importNegociacoes(fileText, filename, mode);
}

function revalidatePaths() {
  revalidatePath('/funil');
  revalidatePath('/contatos');
  revalidatePath('/configuracoes');
  revalidatePath('/dashboard');
  revalidatePath('/ceo');
  revalidatePath('/agenda');
}
