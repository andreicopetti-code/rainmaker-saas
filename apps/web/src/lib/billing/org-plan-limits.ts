import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanSlug, PricingPlanLimits } from '@ceo-brain/shared';
import { getLimitsFromFeatures, parsePlanFeatures } from '@/lib/billing/plan-catalog';

export type OrgPlanContext = {
  orgId: string;
  planSlug: PlanSlug;
  planName: string;
  limits: PricingPlanLimits;
};

export async function getOrgPlanContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgPlanContext> {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan_id, plans(name, features)')
    .eq('id', orgId)
    .single();

  if (error || !data) {
    return {
      orgId,
      planSlug: 'free',
      planName: 'Free',
      limits: getLimitsFromFeatures(null, 'free'),
    };
  }

  const raw = data as { plan_id: string | null; plans: { name: string; features: unknown } | { name: string; features: unknown }[] | null };
  const planRow = Array.isArray(raw.plans) ? raw.plans[0] : raw.plans;
  const features = planRow?.features;
  const slug = (parsePlanFeatures(features)?.slug ?? 'free') as PlanSlug;

  return {
    orgId,
    planSlug: slug,
    planName: planRow?.name ?? 'Free',
    limits: getLimitsFromFeatures(features, slug),
  };
}

export function fichaLimitLabel(limits: PricingPlanLimits): string {
  if (limits.ficha_daily) return `${limits.ficha_daily} fichas/dia`;
  if (limits.ficha_monthly) return `${limits.ficha_monthly} fichas/mês`;
  return 'Preview apenas';
}

export function fichaPeriodRenewalHint(limits: PricingPlanLimits): string {
  if (limits.ficha_daily) return 'Renova à meia-noite.';
  if (limits.ficha_monthly) return 'Renova no início do mês.';
  return '';
}
