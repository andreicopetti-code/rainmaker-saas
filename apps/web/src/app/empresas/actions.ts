'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseStageConfig, stageLabel, visibleStages } from '@/lib/funnel/stage-config';
import {
  buildContactFromEmpresa,
  buildDealDescription,
} from '@/lib/empresas/empresa-contact';
import { getOrgPlanContext } from '@/lib/billing/org-plan-limits';
import {
  buildUfBlockedError,
  getOrgUfAccess,
  isEmpresaUfAllowedForFicha,
  type OrgUfAccess,
} from '@/lib/billing/org-uf-access';

export type EmpresaPreview = {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao: string | null;
  cidade: string | null;
  estado: string | null;
  regime_tributario: string | null;
  regime_historico: string | null;
};

export type EmpresaDetail = EmpresaPreview & {
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  cnae_codigo: string | null;
  cnae_descricao: string | null;
  porte: string | null;
  faturamento_est: string | null;
  funcionarios: string | null;
  data_inicio: string | null;
  socios: string | null;
  segmento: string | null;
};

export type CnpjUsage = {
  used: number;
  limit: number;
  remaining: number;
  periodKind?: 'daily' | 'monthly';
};

export type CnpjHistoryItem = {
  id: string;
  cnpj: string;
  created_at: string;
  razao_social: string | null;
};

export type { OrgUfAccess };

export async function getEmpresasUfAccess(): Promise<OrgUfAccess | null> {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return null;
  return getOrgUfAccess(supabase, orgId);
}

async function assertDealCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
) {
  const planCtx = await getOrgPlanContext(supabase, orgId);
  const { count } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('deleted_at', null);

  if ((count ?? 0) >= planCtx.limits.max_deals) {
    throw new Error(
      `Limite de ${planCtx.limits.max_deals} negócios no funil atingido (plano ${planCtx.planName}). Faça upgrade para adicionar mais.`,
    );
  }
}

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  return data?.organization_id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: Awaited<ReturnType<typeof createClient>>) => supabase as any;

/**
 * Contagens por UF usadas como fallback se o COUNT(*) falhar.
 * Atualizar ao importar um novo estado.
 */
const EMPRESAS_UF_FALLBACK: Record<string, number> = {
  AC: Number(process.env.EMPRESAS_AC_COUNT ?? 54_838),
  AL: Number(process.env.EMPRESAS_AL_COUNT ?? 235_653),
  AM: Number(process.env.EMPRESAS_AM_COUNT ?? 289_117),
  AP: Number(process.env.EMPRESAS_AP_COUNT ?? 51_489),
  CE: Number(process.env.EMPRESAS_CE_COUNT ?? 751_190),
  DF: Number(process.env.EMPRESAS_DF_COUNT ?? 471_967),
  ES: Number(process.env.EMPRESAS_ES_COUNT ?? 608_030),
  GO: Number(process.env.EMPRESAS_GO_COUNT ?? 1_042_139),
  MA: Number(process.env.EMPRESAS_MA_COUNT ?? 378_384),
  MS: Number(process.env.EMPRESAS_MS_COUNT ?? 380_785),
  MT: Number(process.env.EMPRESAS_MT_COUNT ?? 567_771),
  PA: Number(process.env.EMPRESAS_PA_COUNT ?? 500_000),
  PB: Number(process.env.EMPRESAS_PB_COUNT ?? 358_324),
  PE: Number(process.env.EMPRESAS_PE_COUNT ?? 770_441),
  PI: Number(process.env.EMPRESAS_PI_COUNT ?? 246_940),
  PR: Number(process.env.EMPRESAS_PR_COUNT ?? 2_001_527),
  RN: Number(process.env.EMPRESAS_RN_COUNT ?? 307_389),
  RO: Number(process.env.EMPRESAS_RO_COUNT ?? 171_107),
  RS: Number(process.env.EMPRESAS_RS_COUNT ?? 374_984),
  SC: Number(process.env.EMPRESAS_SC_COUNT ?? 1_556_763),
  SE: Number(process.env.EMPRESAS_SE_COUNT ?? 170_485),
  TO: Number(process.env.EMPRESAS_TO_COUNT ?? 180_667),
};

function sumUfFallback(ufs: string[] | null): number {
  if (ufs?.length) {
    return ufs.reduce((sum, uf) => sum + (EMPRESAS_UF_FALLBACK[uf.toUpperCase()] ?? 0), 0);
  }
  return Object.values(EMPRESAS_UF_FALLBACK).reduce((a, b) => a + b, 0);
}

/** Total de empresas na base para as UFs do pacote da organização. */
export async function getEmpresaCount(): Promise<number> {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return 0;

  const access = await getOrgUfAccess(supabase, orgId);

  let ufs: string[] | null = null;
  if (access.isNational || access.isPreviewOnly) {
    ufs = null;
  } else if (access.selectedUfs.length > 0) {
    ufs = access.selectedUfs.map((uf) => uf.trim().toUpperCase()).filter(Boolean);
  } else {
    return 0;
  }

  const { data, error } = await db(supabase).rpc('count_empresas', {
    p_ufs: ufs,
  });
  if (!error && typeof data === 'number') return data;
  if (!error && typeof data === 'string' && /^\d+$/.test(data)) return Number(data);

  // Não fazer COUNT(*) exact aqui: em tabela grande / disco saturado estoura
  // statement_timeout (~30s) e deixa /empresas no skeleton ou 504.
  return sumUfFallback(ufs);
}

export async function getCnpjUsage(): Promise<CnpjUsage> {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return { used: 0, limit: 0, remaining: 0 };

  const { data } = await db(supabase).rpc('get_cnpj_daily_usage', {
    p_org_id: orgId,
    p_date: null,
    p_daily_limit: null,
  });
  if (data) {
    const row = data as CnpjUsage & { period_kind?: string };
    return {
      used: row.used,
      limit: row.limit,
      remaining: row.remaining,
      periodKind: row.period_kind === 'monthly' ? 'monthly' : 'daily',
    };
  }
  return { used: 0, limit: 0, remaining: 0 };
}

export async function searchCnpjPreview(cnpj: string): Promise<{
  data: EmpresaPreview | null;
  error: string | null;
}> {
  const raw = cnpj.replace(/\D/g, '');
  if (raw.length !== 14) return { data: null, error: 'CNPJ inválido' };

  const supabase = await createClient();
  const { data, error } = await db(supabase)
    .from('empresas')
    .select('cnpj,razao_social,nome_fantasia,situacao,cidade,estado,regime_tributario,regime_historico')
    .eq('cnpj', raw)
    .limit(1)
    .single();

  if (error || !data) return { data: null, error: 'CNPJ não encontrado na base' };
  return { data: data as EmpresaPreview, error: null };
}

export async function getEmpresaDetail(cnpj: string): Promise<{
  data: EmpresaDetail | null;
  error: string | null;
  usage: CnpjUsage | null;
}> {
  const raw = cnpj.replace(/\D/g, '');
  if (raw.length !== 14) return { data: null, error: 'CNPJ inválido', usage: null };

  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return { data: null, error: 'Organização não encontrada', usage: null };

  const { data: estadoRow } = await db(supabase)
    .from('empresas')
    .select('estado,razao_social,nome_fantasia')
    .eq('cnpj', raw)
    .limit(1)
    .maybeSingle();

  if (!estadoRow) {
    return { data: null, error: 'CNPJ não encontrado na base', usage: null };
  }

  const preview = estadoRow as {
    estado: string | null;
    razao_social: string | null;
    nome_fantasia: string | null;
  };
  const queryName =
    preview.razao_social?.trim() || preview.nome_fantasia?.trim() || null;

  const ufAccess = await getOrgUfAccess(supabase, orgId);
  if (!isEmpresaUfAllowedForFicha(ufAccess, preview.estado)) {
    const usage = await getCnpjUsage();
    return {
      data: null,
      error: buildUfBlockedError(ufAccess, preview.estado),
      usage,
    };
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: creditResult } = await db(supabase).rpc('consume_cnpj_credit', {
    p_org_id: orgId,
    p_date: today,
    p_cnpj: raw,
    p_daily_limit: null,
    p_razao_social: queryName,
  });

  const cr = creditResult as { allowed: boolean; used: number; limit: number; period_kind?: string } | null;
  const usage: CnpjUsage = {
    used: cr?.used ?? 0,
    limit: cr?.limit ?? 0,
    remaining: Math.max(0, (cr?.limit ?? 0) - (cr?.used ?? 0)),
    periodKind: cr?.period_kind === 'monthly' ? 'monthly' : 'daily',
  };

  if (!cr?.allowed) {
    const renewal = usage.periodKind === 'monthly' ? 'Renova no início do mês.' : 'Renova à meia-noite.';
    if (usage.limit <= 0) {
      return { data: null, error: 'Ficha completa disponível apenas em planos pagos. Faça upgrade.', usage };
    }
    return {
      data: null,
      error: `Limite de ${usage.limit} fichas atingido. ${renewal}`,
      usage,
    };
  }

  const { data, error } = await db(supabase)
    .from('empresas')
    .select('*')
    .eq('cnpj', raw)
    .limit(1)
    .single();

  if (error || !data) return { data: null, error: 'CNPJ não encontrado na base', usage };
  return { data: data as EmpresaDetail, error: null, usage };
}

export async function getCnpjHistory(): Promise<CnpjHistoryItem[]> {
  const supabase = await createClient();
  const orgId = await getOrgId(supabase);
  if (!orgId) return [];

  const { data: rows } = await supabase
    .from('cnpj_queries')
    .select('id,cnpj,created_at,razao_social')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!rows?.length) return [];

  return rows.map((r) => ({
    id: r.id,
    cnpj: r.cnpj,
    created_at: r.created_at,
    razao_social: r.razao_social?.trim() || null,
  }));
}

export async function sendCnpjToFunil(empresa: EmpresaDetail): Promise<{
  success: boolean;
  error: string | null;
  opportunityId: string | null;
  alreadyExists?: boolean;
}> {
  const raw = empresa.cnpj.replace(/\D/g, '');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Usuário não autenticado', opportunityId: null };

  const orgId = await getOrgId(supabase);
  if (!orgId) return { success: false, error: 'Organização não encontrada', opportunityId: null };

  const ufAccess = await getOrgUfAccess(supabase, orgId);
  if (!isEmpresaUfAllowedForFicha(ufAccess, empresa.estado)) {
    return {
      success: false,
      error: buildUfBlockedError(ufAccess, empresa.estado),
      opportunityId: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: funnelData, error: funnelErr } = await (supabase as any)
    .from('funnels')
    .select('id, stages, stage_config')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (funnelErr || !funnelData) {
    return { success: false, error: 'Funil não encontrado', opportunityId: null };
  }

  const stageConfig = parseStageConfig(funnelData.stage_config, funnelData.stages ?? []);
  const firstStage = visibleStages(stageConfig)[0]?.id ?? stageConfig[0]?.id ?? 'Prospecção';

  // Verifica se já existe deal com esse CNPJ no funil
  const { data: existingOpps } = await supabase
    .from('opportunities')
    .select('id, title, stage, contact:contacts(cnpj, company, name)')
    .eq('organization_id', orgId)
    .eq('funnel_id', funnelData.id)
    .is('deleted_at', null);

  const duplicate = (existingOpps ?? []).find((opp) => {
    const contact = opp.contact as { cnpj?: string | null; company?: string | null; name?: string | null } | null;
    return (contact?.cnpj ?? '').replace(/\D/g, '') === raw;
  });

  if (duplicate) {
    const contact = duplicate.contact as { company?: string | null; name?: string | null } | null;
    const nome = contact?.company || contact?.name || duplicate.title;
    return {
      success: false,
      error: `Esta empresa já está no funil como "${nome}" (${stageLabel(stageConfig, duplicate.stage as string)}).`,
      opportunityId: duplicate.id,
      alreadyExists: true,
    };
  }

  try {
    await assertDealCapacity(supabase, orgId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Limite de negócios atingido',
      opportunityId: null,
    };
  }

  const razao = empresa.razao_social?.trim() || '';
  const fantasia = empresa.nome_fantasia?.trim() || '';
  const title = fantasia || razao || raw;

  const contactData = buildContactFromEmpresa(empresa);
  const dealDescription = buildDealDescription(empresa);

  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('cnpj', raw)
    .is('deleted_at', null)
    .maybeSingle();

  let contactId = existingContact?.id;

  const contactPayload = {
    organization_id: orgId,
    ...contactData,
    updated_at: new Date().toISOString(),
  };

  if (contactId) {
    const { error: contactErr } = await supabase
      .from('contacts')
      .update(contactPayload)
      .eq('id', contactId)
      .eq('organization_id', orgId);
    if (contactErr) return { success: false, error: contactErr.message, opportunityId: null };
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({ ...contactPayload, created_by: user.id })
      .select('id')
      .single();
    if (contactErr || !newContact) {
      return { success: false, error: contactErr?.message ?? 'Erro ao criar contato', opportunityId: null };
    }
    contactId = newContact.id;
  }

  const probability = stageConfig.find((s) => s.id === firstStage)?.prob ?? 10;

  const { data: opp, error: oppErr } = await supabase
    .from('opportunities')
    .insert({
      organization_id: orgId,
      funnel_id: funnelData.id,
      title,
      stage: firstStage,
      probability,
      description: dealDescription,
      contact_id: contactId,
      owner_id: user.id,
      custom_fields: { lead_source: 'Consulta CNPJ' },
    })
    .select('id')
    .single();

  if (oppErr || !opp) {
    return { success: false, error: oppErr?.message ?? 'Erro ao criar deal', opportunityId: null };
  }

  revalidatePath('/funil');
  revalidatePath('/contatos');
  return { success: true, error: null, opportunityId: opp.id };
}
