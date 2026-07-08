'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { resolveStageId, stageLabel } from '@/lib/funnel/stage-config';
import { isLostStage } from '@/lib/ceo/stage-utils';
import type { OpportunityFormData } from '@/components/board/types';
import { getOrgPlanContext } from '@/lib/billing/org-plan-limits';
import { assertCanModifyOpportunity, resolveDealOwnerId } from '@/lib/org/deal-access';

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  return { supabase, user, org };
}

function probabilityForStage(config: FunnelStageConfig[], stage: string) {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  return match?.prob ?? 50;
}

/** Upsert do contato vinculado ao deal. Retorna o contact_id. */
async function upsertContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  data: OpportunityFormData,
): Promise<string | null> {
  if (!data.contact_name?.trim()) return data.contact_id ?? null;

  const contactPayload = {
    organization_id: orgId,
    name: data.contact_name.trim(),
    company: data.contact_company?.trim() || null,
    cnpj: data.contact_cnpj?.replace(/\D/g, '') || null,
    email: data.contact_email?.trim() || null,
    phone: data.contact_phone?.trim() || null,
    position: data.contact_position?.trim() || null,
    custom_fields: {
      tipo_pessoa: data.contact_tipo_pessoa ?? 'pj',
      situacao: data.contact_situacao || null,
      endereco: data.contact_endereco?.trim() || null,
      municipio: data.contact_municipio?.trim() || null,
      uf: data.contact_uf?.trim().toUpperCase() || null,
      cep: data.contact_cep?.replace(/\D/g, '') || null,
      setor: data.contact_setor || null,
      regime_tributario: data.contact_regime_tributario || null,
      porte: data.contact_porte || null,
      contact_person: data.contact_person_name?.trim() || null,
    },
    updated_at: new Date().toISOString(),
  };

  if (data.contact_id) {
    const { error } = await supabase
      .from('contacts')
      .update(contactPayload)
      .eq('id', data.contact_id)
      .eq('organization_id', orgId);
    if (error) throw new Error(error.message);
    return data.contact_id;
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({ ...contactPayload, created_by: userId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

export async function createOpportunity(
  funnelId: string,
  stageConfig: FunnelStageConfig[],
  data: OpportunityFormData,
) {
  const { supabase, user, org } = await getAuthContext();

  const title = data.title.trim();
  if (!title) throw new Error('Informe o nome do deal');

  const planCtx = await getOrgPlanContext(supabase, org.organization_id);
  const { count } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null);

  if ((count ?? 0) >= planCtx.limits.max_deals) {
    throw new Error(
      `Limite de ${planCtx.limits.max_deals} negócios no funil atingido (plano ${planCtx.planName}). Faça upgrade para adicionar mais.`,
    );
  }

  const value = data.value ? parseFloat(data.value.replace(',', '.')) : null;
  const contactId = await upsertContact(supabase, org.organization_id, user.id, data);

  const { error } = await supabase.from('opportunities').insert({
    funnel_id: funnelId,
    organization_id: org.organization_id,
    title,
    stage: data.stage,
    value: Number.isFinite(value) ? value : null,
    probability: data.probability ?? probabilityForStage(stageConfig, data.stage),
    description: data.description?.trim() || null,
    owner_id: resolveDealOwnerId(org.role, user.id, data.owner_id),
    contact_id: contactId,
    tags: data.tags?.length ? data.tags : null,
    expected_close_date: data.expected_close_date || null,
    lost_reason: data.lost_reason?.trim() || null,
    custom_fields: {
      tier: data.tier ?? null,
      lead_source: data.lead_source ?? null,
    },
  });

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
  revalidatePath('/contatos');
}

export async function updateOpportunity(
  id: string,
  stageConfig: FunnelStageConfig[],
  data: OpportunityFormData,
) {
  const { supabase, user, org } = await getAuthContext();

  const title = data.title.trim();
  if (!title) throw new Error('Informe o nome do deal');

  await assertCanModifyOpportunity(supabase, id, org.organization_id, user.id, org.role);

  const { data: existing, error: fetchErr } = await supabase
    .from('opportunities')
    .select('stage, contact_id, owner_id')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) throw new Error('Deal não encontrado');

  const value = data.value ? parseFloat(data.value.replace(',', '.')) : null;
  const stageChanged = existing.stage !== data.stage;
  const movingToLost = isLostStage(data.stage, stageConfig);
  if (movingToLost && !data.lost_reason?.trim()) {
    throw new Error('Informe o motivo da perda');
  }
  const contactId = await upsertContact(supabase, org.organization_id, user.id, data);

  const { error } = await supabase
    .from('opportunities')
    .update({
      title,
      stage: data.stage,
      value: Number.isFinite(value) ? value : null,
      probability: data.probability ?? probabilityForStage(stageConfig, data.stage),
      description: data.description?.trim() || null,
      owner_id: resolveDealOwnerId(org.role, user.id, data.owner_id, existing.owner_id),
      contact_id: contactId,
      tags: data.tags?.length ? data.tags : null,
      expected_close_date: data.expected_close_date || null,
      lost_reason: data.lost_reason?.trim() || null,
      custom_fields: {
        tier: data.tier ?? null,
        lead_source: data.lead_source ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);

  if (stageChanged) {
    await supabase.from('activity_logs').insert({
      organization_id: org.organization_id,
      user_id: user.id,
      entity_type: 'opportunity',
      entity_id: id,
      type: 'stage_change',
      description: `Movido para ${stageLabel(stageConfig, data.stage)}`,
      metadata: { from: existing.stage, to: data.stage },
    });
  }

  revalidatePath('/funil');
  revalidatePath('/contatos');
}

export async function moveOpportunity(
  id: string,
  stageConfig: FunnelStageConfig[],
  newStage: string,
  lostReason?: string,
) {
  const { supabase, user, org } = await getAuthContext();

  await assertCanModifyOpportunity(supabase, id, org.organization_id, user.id, org.role);

  const { data: existing, error: fetchErr } = await supabase
    .from('opportunities')
    .select('stage')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) throw new Error('Deal não encontrado');
  if (existing.stage === newStage) return;

  const movingToLost = isLostStage(newStage, stageConfig);
  const reason = lostReason?.trim() ?? '';
  if (movingToLost && !reason) {
    throw new Error('Informe o motivo da perda');
  }

  const { error } = await supabase
    .from('opportunities')
    .update({
      stage: newStage,
      probability: probabilityForStage(stageConfig, newStage),
      lost_reason: movingToLost ? reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);

  await supabase.from('activity_logs').insert({
    organization_id: org.organization_id,
    user_id: user.id,
    entity_type: 'opportunity',
    entity_id: id,
    type: 'stage_change',
    description: `Movido para ${stageLabel(stageConfig, newStage)}`,
    metadata: { from: existing.stage, to: newStage },
  });

  revalidatePath('/funil');
  revalidatePath('/contatos');
}

export async function reorderOpportunities(updates: { id: string; sort_order: number }[]) {
  const { supabase, user, org } = await getAuthContext();

  if (org.role !== 'admin') {
    for (const { id } of updates) {
      await assertCanModifyOpportunity(supabase, id, org.organization_id, user.id, org.role);
    }
  }

  // sort_order not yet in generated types — use untyped client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as unknown as any;
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabaseAny
        .from('opportunities')
        .update({ sort_order, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', org.organization_id),
    ),
  );
  // no revalidatePath — caller handles optimistic UI
}

export async function deleteOpportunity(id: string) {
  const { supabase, org } = await getAuthContext();

  // SECURITY DEFINER bypasses RLS soft-delete conflict
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('soft_delete_opportunity', {
    p_id: id,
    p_org_id: org.organization_id,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
  revalidatePath('/contatos');
}

export type TrashedOpportunity = {
  id: string;
  title: string;
  stage: string;
  deleted_at: string;
  owner_id: string;
  owner_name: string | null;
  contact_company: string | null;
};

export async function listTrashedOpportunities(funnelId: string): Promise<TrashedOpportunity[]> {
  const { supabase, org } = await getAuthContext();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('list_trashed_opportunities', {
    p_funnel_id: funnelId,
    p_org_id: org.organization_id,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as TrashedOpportunity[];
}

export async function restoreOpportunity(id: string) {
  const { supabase, org } = await getAuthContext();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('restore_opportunity', {
    p_id: id,
    p_org_id: org.organization_id,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
  revalidatePath('/contatos');
  revalidatePath('/dashboard');
  revalidatePath('/ceo');
}

export async function permanentlyDeleteOpportunity(id: string) {
  const { supabase, org } = await getAuthContext();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('hard_delete_opportunity', {
    p_id: id,
    p_org_id: org.organization_id,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
}

export async function emptyOpportunityTrash(funnelId: string) {
  const { supabase, org } = await getAuthContext();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('empty_opportunity_trash', {
    p_funnel_id: funnelId,
    p_org_id: org.organization_id,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
}
