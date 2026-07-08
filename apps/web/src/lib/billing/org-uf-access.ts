import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAZILIAN_UFS } from '@/lib/contacts/constants';
import { getOrgPlanContext } from '@/lib/billing/org-plan-limits';

export type OrgUfAccess = {
  orgId: string;
  planName: string;
  ufLimit: number;
  selectedUfs: string[];
  requiresSelection: boolean;
  needsSelection: boolean;
  isNational: boolean;
  isPreviewOnly: boolean;
  ufsLocked: boolean;
  canAddUfs: boolean;
};

export const ALL_BRAZILIAN_UFS = [...BRAZILIAN_UFS];

export function isNationalPlan(allowedUfs: number): boolean {
  return allowedUfs >= 27;
}

export function requiresUfSelection(allowedUfs: number): boolean {
  return allowedUfs > 0 && allowedUfs < 27;
}

export function isEmpresaUfAllowedForFicha(
  access: OrgUfAccess,
  uf: string | null | undefined,
): boolean {
  if (access.needsSelection) return false;
  const normalized = uf?.trim().toUpperCase();
  if (!normalized) return false;
  if (access.isNational || access.isPreviewOnly) return true;
  return access.selectedUfs.includes(normalized);
}

export function buildUfBlockedError(
  access: OrgUfAccess,
  empresaUf: string | null | undefined,
): string {
  const uf = empresaUf?.trim().toUpperCase() || '—';
  if (access.needsSelection) {
    return `Escolha ${access.ufLimit === 1 ? 'a UF' : `até ${access.ufLimit} UFs`} do seu plano em Configurações antes de desbloquear fichas completas.`;
  }
  const contracted = access.selectedUfs.length > 0
    ? access.selectedUfs.join(', ')
    : 'nenhuma UF configurada';
  return `Esta empresa é de ${uf}. Seu plano ${access.planName} inclui: ${contracted}. Contrate +1 UF em Plano e assinatura para incluir outro estado.`;
}

export async function getOrgUfAccess(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgUfAccess> {
  const planCtx = await getOrgPlanContext(supabase, orgId);
  const baseUfLimit = planCtx.limits.allowed_ufs;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: rows }, { data: addonState }, { data: orgRow }] = await Promise.all([
    sb
      .from('organization_allowed_ufs')
      .select('uf')
      .eq('organization_id', orgId)
      .order('uf'),
    sb
      .from('organization_addon_state')
      .select('extra_uf_slots')
      .eq('organization_id', orgId)
      .maybeSingle(),
    sb
      .from('organizations')
      .select('allowed_ufs_locked_at')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  const extraSlots = (addonState as { extra_uf_slots?: number } | null)?.extra_uf_slots ?? 0;
  const ufLimit = baseUfLimit + extraSlots;
  const selectedUfs = ((rows ?? []) as { uf: string }[]).map((r) => r.uf);
  const requires = requiresUfSelection(ufLimit);
  const needsSelection = requires && selectedUfs.length === 0;
  const lockedAt = (orgRow as { allowed_ufs_locked_at?: string | null } | null)?.allowed_ufs_locked_at;
  const ufsLocked = !!lockedAt || selectedUfs.length > 0;
  const canAddUfs = ufsLocked && selectedUfs.length < ufLimit;

  return {
    orgId,
    planName: planCtx.planName,
    ufLimit,
    selectedUfs,
    requiresSelection: requires,
    needsSelection,
    isNational: isNationalPlan(ufLimit),
    isPreviewOnly: baseUfLimit === 0 && extraSlots === 0,
    ufsLocked,
    canAddUfs,
  };
}
