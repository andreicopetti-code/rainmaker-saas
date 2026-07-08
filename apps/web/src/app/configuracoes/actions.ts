'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  defaultStageConfig,
  parseStageConfig,
  stageIds,
  type FunnelStageConfig,
} from '@/lib/funnel/stage-config';
import { BRAZILIAN_UFS } from '@/lib/contacts/constants';
import { getOrgUfAccess, type OrgUfAccess } from '@/lib/billing/org-uf-access';

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  return { supabase, user, org };
}

async function getOrgFunnel(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('funnels')
    .select('id, name, stages, stage_config, organization_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as {
    id: string;
    name: string;
    stages: string[];
    stage_config: unknown;
    organization_id: string;
  } | null;
}

export type FunnelSettingsData = {
  funnelId: string;
  funnelName: string;
  stageConfig: FunnelStageConfig[];
  stageCounts: Record<string, number>;
};

export async function getFunnelSettings(): Promise<FunnelSettingsData | null> {
  const { supabase, org } = await getAuthContext();
  const funnel = await getOrgFunnel(supabase, org.organization_id);
  if (!funnel) return null;

  const stageConfig = parseStageConfig(funnel.stage_config, funnel.stages);

  const { data: opps, error } = await supabase
    .from('opportunities')
    .select('stage')
    .eq('funnel_id', funnel.id)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const stageCounts: Record<string, number> = {};
  for (const s of stageConfig) stageCounts[s.id] = 0;

  for (const row of opps ?? []) {
    const stored = row.stage as string;
    const match =
      stageConfig.find((s) => s.id === stored) ??
      stageConfig.find((s) => s.label === stored);
    const key = match?.id ?? stored;
    stageCounts[key] = (stageCounts[key] ?? 0) + 1;
  }

  return {
    funnelId: funnel.id,
    funnelName: funnel.name,
    stageConfig,
    stageCounts,
  };
}

type StageUpdateOpts = {
  deletedStageId?: string;
  deletedStageLabel?: string;
  fallbackStageId?: string;
  isReset?: boolean;
};

async function persistStageConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  funnelId: string,
  config: FunnelStageConfig[],
  opts?: StageUpdateOpts,
) {
  if (config.length < 1) throw new Error('É necessário ao menos uma etapa');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  if (opts?.deletedStageId && opts.fallbackStageId) {
    const { error: moveErr } = await sb
      .from('opportunities')
      .update({
        stage: opts.fallbackStageId,
        updated_at: new Date().toISOString(),
      })
      .eq('funnel_id', funnelId)
      .eq('organization_id', orgId)
      .in('stage', [opts.deletedStageId, opts.deletedStageLabel ?? opts.deletedStageId]);

    if (moveErr) throw new Error(moveErr.message);
  }

  if (opts?.isReset) {
    const defaults = defaultStageConfig();
    const defaultIds = new Set(defaults.map((s) => s.id));
    const fallbackId = defaults[0].id;

    const { data: orphanOpps, error: fetchErr } = await supabase
      .from('opportunities')
      .select('id, stage')
      .eq('funnel_id', funnelId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (fetchErr) throw new Error(fetchErr.message);

    const toMove = (orphanOpps ?? []).filter((o) => !defaultIds.has(o.stage as string));
    if (toMove.length) {
      await Promise.all(
        toMove.map((o) =>
          sb
            .from('opportunities')
            .update({ stage: fallbackId, updated_at: new Date().toISOString() })
            .eq('id', o.id),
        ),
      );
    }
  }

  const { error } = await sb
    .from('funnels')
    .update({
      stage_config: config,
      stages: stageIds(config),
      updated_at: new Date().toISOString(),
    })
    .eq('id', funnelId)
    .eq('organization_id', orgId);

  if (error) throw new Error(error.message);

  revalidatePath('/funil');
  revalidatePath('/configuracoes');
}

export async function saveFunnelStages(
  funnelId: string,
  config: FunnelStageConfig[],
  opts?: StageUpdateOpts,
) {
  const { supabase, org } = await getAuthContext();
  await persistStageConfig(supabase, org.organization_id, funnelId, config, opts);
}

export async function resetFunnelStages(funnelId: string) {
  const config = defaultStageConfig();
  const { supabase, org } = await getAuthContext();
  await persistStageConfig(supabase, org.organization_id, funnelId, config, { isReset: true });
}

export type OrganizationUfSettings = OrgUfAccess & {
  isAdmin: boolean;
};

export async function getOrganizationUfSettings(): Promise<OrganizationUfSettings | null> {
  const { supabase, org } = await getAuthContext();
  const access = await getOrgUfAccess(supabase, org.organization_id);
  return {
    ...access,
    isAdmin: org.role === 'admin',
  };
}

export async function saveOrganizationAllowedUfs(
  ufs: string[],
): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, org } = await getAuthContext();
    if (org.role !== 'admin') {
      return { error: 'Somente administradores podem alterar as UFs do plano.' };
    }

    const access = await getOrgUfAccess(supabase, org.organization_id);
    if (!access.requiresSelection) {
      return { error: 'Seu plano não exige escolha de UF.' };
    }

    const normalized = [...new Set(
      ufs.map((u) => u.trim().toUpperCase()).filter(Boolean),
    )];

    if (normalized.length === 0) {
      return { error: `Selecione ao menos 1 UF (máx. ${access.ufLimit}).` };
    }
    if (normalized.length > access.ufLimit) {
      return { error: `Máximo de ${access.ufLimit} UF(s) no plano ${access.planName}.` };
    }

    for (const uf of normalized) {
      if (!BRAZILIAN_UFS.includes(uf as (typeof BRAZILIAN_UFS)[number])) {
        return { error: `UF inválida: ${uf}` };
      }
    }

    const currentUfs = access.selectedUfs;

    if (access.ufsLocked) {
      for (const uf of currentUfs) {
        if (!normalized.includes(uf)) {
          return {
            error:
              'UFs já contratadas não podem ser trocadas ou removidas. Contrate +1 UF em Plano e assinatura para incluir outro estado.',
          };
        }
      }

      const toAdd = normalized.filter((uf) => !currentUfs.includes(uf));
      if (toAdd.length === 0) {
        return { ok: true };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { error: insErr } = await sb
        .from('organization_allowed_ufs')
        .insert(toAdd.map((uf) => ({ organization_id: org.organization_id, uf })));
      if (insErr) return { error: insErr.message };

      revalidatePath('/empresas');
      revalidatePath('/configuracoes');
      revalidatePath('/billing');
      return { ok: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: delErr } = await sb
      .from('organization_allowed_ufs')
      .delete()
      .eq('organization_id', org.organization_id);
    if (delErr) return { error: delErr.message };

    const { error: insErr } = await sb
      .from('organization_allowed_ufs')
      .insert(normalized.map((uf) => ({ organization_id: org.organization_id, uf })));
    if (insErr) return { error: insErr.message };

    const { error: lockErr } = await sb
      .from('organizations')
      .update({
        allowed_ufs_locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.organization_id)
      .is('allowed_ufs_locked_at', null);
    if (lockErr) return { error: lockErr.message };

    revalidatePath('/empresas');
    revalidatePath('/configuracoes');
    revalidatePath('/billing');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar UFs' };
  }
}
