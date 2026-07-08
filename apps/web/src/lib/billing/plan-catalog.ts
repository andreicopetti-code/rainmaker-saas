import type { PlanSlug, PricingPlanLimits } from '@ceo-brain/shared';
import { getPlanBySlug, PRICING_PLANS } from '@ceo-brain/shared';

export type PlanFeaturesJson = Partial<PricingPlanLimits> & { slug?: PlanSlug };

export function parsePlanFeatures(raw: unknown): PlanFeaturesJson | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as PlanFeaturesJson;
}

export function getLimitsFromFeatures(raw: unknown, fallbackSlug: PlanSlug = 'free'): PricingPlanLimits {
  const parsed = parsePlanFeatures(raw);
  if (parsed?.slug) {
    const catalog = getPlanBySlug(parsed.slug);
    if (catalog) return catalog.limits;
  }
  if (parsed && typeof parsed.max_deals === 'number') {
    return {
      max_deals: parsed.max_deals,
      max_members: parsed.max_members ?? 1,
      ai_monthly: parsed.ai_monthly ?? 30,
      ficha_monthly: parsed.ficha_monthly ?? null,
      ficha_daily: parsed.ficha_daily ?? null,
      allowed_ufs: parsed.allowed_ufs ?? 0,
      emails_enabled: parsed.emails_enabled ?? false,
      ceo_brain_enabled: parsed.ceo_brain_enabled ?? true,
      import_enabled: parsed.import_enabled ?? true,
    };
  }
  return getPlanBySlug(fallbackSlug)!.limits;
}

export function formatFichaLimit(limits: PricingPlanLimits): string {
  if (limits.ficha_daily) return `${limits.ficha_daily} fichas/dia`;
  if (limits.ficha_monthly) return `${limits.ficha_monthly} fichas/mês`;
  return 'Preview apenas';
}

export function formatUfLimit(limits: PricingPlanLimits): string {
  if (limits.allowed_ufs >= 27) return 'Todas UFs + DF';
  if (limits.allowed_ufs === 1) return '1 UF à escolha';
  if (limits.allowed_ufs > 1) return `${limits.allowed_ufs} UFs à escolha`;
  return 'Preview CNPJ';
}

export { PRICING_PLANS };
