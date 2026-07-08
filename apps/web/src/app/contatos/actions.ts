'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { OpportunityCustomFields } from '@/components/board/types';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { parseStageConfig, stageLabel } from '@/lib/funnel/stage-config';
import type { ContactAgendaItem } from '@/lib/contacts/types';
import {
  formatDocument,
  getDisplayName,
  isContactPJ,
  parseContactCustomFields,
} from '@/lib/contacts/utils';

export type ContactsAgendaData = {
  items: ContactAgendaItem[];
  stageConfig: FunnelStageConfig[];
};

function stageColors(config: FunnelStageConfig[], stageId: string | null) {
  if (!stageId) return { label: null, bg: null, text: null };
  const match = config.find((s) => s.id === stageId);
  if (!match) {
    return { label: stageLabel(config, stageId), bg: '#EFF6FF', text: '#1D4ED8' };
  }
  return { label: match.label, bg: match.bg, text: match.text };
}

function parseOppFields(raw: unknown): OpportunityCustomFields | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as OpportunityCustomFields;
}

export async function getContactsAgenda(): Promise<ContactsAgendaData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: funnel } = await (supabase as any)
    .from('funnels')
    .select('id, stages, stage_config')
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const stageConfig = funnel
    ? parseStageConfig(funnel.stage_config, funnel.stages)
    : parseStageConfig(null);

  const [{ data: contacts }, { data: opps }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, name, company, cnpj, email, phone, position, custom_fields')
      .eq('organization_id', org.organization_id)
      .is('deleted_at', null)
      .order('name'),
    funnel
      ? supabase
          .from('opportunities')
          .select('id, contact_id, stage, value, custom_fields, updated_at')
          .eq('organization_id', org.organization_id)
          .eq('funnel_id', funnel.id)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  type OppRow = {
    id: string;
    contact_id: string | null;
    stage: string;
    value: number | null;
    custom_fields: unknown;
    updated_at: string | null;
  };

  const oppByContact = new Map<string, OppRow>();
  for (const row of (opps ?? []) as OppRow[]) {
    if (!row.contact_id || oppByContact.has(row.contact_id)) continue;
    oppByContact.set(row.contact_id, row);
  }

  const items: ContactAgendaItem[] = (contacts ?? []).map((c) => {
    const custom = parseContactCustomFields(c.custom_fields);
    const isPJ = isContactPJ(c.cnpj, custom);
    const opp = oppByContact.get(c.id);
    const oppCustom = parseOppFields(opp?.custom_fields);
    const colors = stageColors(stageConfig, opp?.stage ?? null);

    const municipio = custom?.municipio?.trim() || null;
    const uf = custom?.uf?.trim().toUpperCase() || null;
    const cityUf = municipio
      ? `${municipio.toUpperCase()}${uf ? ` / ${uf}` : ''}`
      : uf
        ? uf
        : null;

    return {
      contactId: c.id,
      opportunityId: opp?.id ?? null,
      displayName: getDisplayName(c.name, c.company, isPJ),
      legalName: c.name?.trim() || '',
      isPJ,
      doc: formatDocument(c.cnpj, custom?.cpf, isPJ),
      contactPerson: custom?.contact_person?.trim() || c.position?.trim() || null,
      phone: c.phone?.trim() || null,
      email: c.email?.trim() || null,
      cityUf,
      setor: custom?.setor?.trim() || null,
      regime: custom?.regime_tributario?.trim() || null,
      porte: custom?.porte?.trim() || null,
      origem: oppCustom?.lead_source?.trim() || null,
      stageId: opp?.stage ?? null,
      stageLabel: colors.label,
      stageBg: colors.bg,
      stageText: colors.text,
      value: opp?.value ?? null,
    };
  });

  return { items, stageConfig };
}

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  return { supabase, user, org };
}

/** Exclui contato e deals vinculados (soft delete). */
export async function deleteContact(contactId: string) {
  const { supabase, org } = await getAuthContext();

  const { data: opps, error: oppListErr } = await supabase
    .from('opportunities')
    .select('id')
    .eq('contact_id', contactId)
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null);

  if (oppListErr) throw new Error(oppListErr.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  for (const opp of opps ?? []) {
    const { error } = await supabaseAny.rpc('soft_delete_opportunity', {
      p_id: opp.id,
      p_org_id: org.organization_id,
    });
    if (error) throw new Error(error.message);
  }

  const { error: contactErr } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('organization_id', org.organization_id);

  if (contactErr) throw new Error(contactErr.message);

  revalidatePath('/contatos');
  revalidatePath('/funil');
  revalidatePath('/agenda');
}
