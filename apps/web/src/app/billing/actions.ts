'use server';

import { createClient } from '@/lib/supabase/server';
import {
  evaluateBillingAccess,
  type BillingAccess,
  type OrgSubscriptionRow,
} from '@/lib/billing/subscription';
import {
  getAppUrl,
  getStripe,
  isStripeConfigured,
  resolveMonthlyPriceId,
} from '@/lib/billing/stripe';
import { syncFromCheckoutSession } from '@/lib/billing/checkout-sync';
import {
  formatFichaLimit,
  formatUfLimit,
  getLimitsFromFeatures,
  parsePlanFeatures,
} from '@/lib/billing/plan-catalog';
import type { PlanSlug } from '@ceo-brain/shared';
import { getPlanBySlug, getPurchasablePlans, PRICING_ADDONS, type AddonSlug } from '@ceo-brain/shared';
import { getOrgAddonSummary, getAddonPriceId } from '@/lib/billing/addon-sync';

export type BillingPlanOption = {
  id: string;
  slug: PlanSlug;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  stripePriceMonthlyId: string | null;
  stripeConfigured: boolean;
  highlights: string[];
  ufLabel: string;
  fichaLabel: string;
};

export type BillingPlan = {
  id: string;
  slug: PlanSlug | null;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  stripePriceMonthlyId: string | null;
  limits: ReturnType<typeof getLimitsFromFeatures>;
};

export type BillingSummary = BillingAccess & {
  organizationId: string;
  organizationName: string;
  role: string;
  stripeConfigured: boolean;
  plan: BillingPlan | null;
  canManageBilling: boolean;
  subscriptionStartedAt: string | null;
  addonExtraUfSlots: number;
  addonFichaCredits: number;
  isFreePlan: boolean;
};

export type BillingAddonOption = {
  slug: AddonSlug;
  name: string;
  description: string;
  price: number;
  unitLabel: string;
  billing: 'recurring' | 'one_time';
  stripeConfigured: boolean;
};

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', {
    p_user_id: user.id,
  });
  const membership = orgRows?.[0];
  if (!membership) throw new Error('Organização não encontrada');

  return { supabase, user, membership };
}

async function loadOrganization(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      id, name, plan_id, subscription_status, trial_ends_at,
      subscription_started_at, subscription_ended_at,
      stripe_customer_id, stripe_subscription_id,
      plan:plans(id, name, price_monthly, price_annual, stripe_price_monthly_id, features)
    `)
    .eq('id', orgId)
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Organização não encontrada');
  return data;
}

function toBillingPlan(raw: unknown): BillingPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as {
    id: string;
    name: string;
    price_monthly: number;
    price_annual: number;
    stripe_price_monthly_id: string | null;
    features: unknown;
  };
  const parsed = parsePlanFeatures(p.features);
  const slug = parsed?.slug ?? null;
  return {
    id: p.id,
    slug,
    name: p.name,
    priceMonthly: Number(p.price_monthly),
    priceAnnual: Number(p.price_annual),
    stripePriceMonthlyId: p.stripe_price_monthly_id,
    limits: getLimitsFromFeatures(p.features),
  };
}

async function loadPlanBySlug(slug: PlanSlug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('plans')
    .select('id, name, price_monthly, price_annual, stripe_price_monthly_id, features')
    .contains('features', { slug })
    .maybeSingle();

  if (error || !data) {
    const catalog = getPlanBySlug(slug);
    throw new Error(catalog ? `Plano ${catalog.name} ainda não está no banco. Rode a migration.` : 'Plano inválido');
  }
  return toBillingPlan(data)!;
}

export async function listBillingPlans(): Promise<BillingPlanOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select('id, name, price_monthly, price_annual, stripe_price_monthly_id, features');

  const stripeOk = isStripeConfigured();

  return getPurchasablePlans().map((catalog) => {
    const row = (data ?? []).find(
      (d) => parsePlanFeatures(d.features)?.slug === catalog.slug,
    );
    const limits = catalog.limits;
    const priceId = resolveMonthlyPriceId(row?.stripe_price_monthly_id);
    return {
      id: row?.id ?? catalog.slug,
      slug: catalog.slug,
      name: catalog.name,
      priceMonthly: row ? Number(row.price_monthly) : catalog.price_monthly,
      priceAnnual: row ? Number(row.price_annual) : catalog.price_annual,
      stripePriceMonthlyId: row?.stripe_price_monthly_id ?? null,
      stripeConfigured: stripeOk && !!priceId,
      highlights: catalog.highlights,
      ufLabel: formatUfLimit(limits),
      fichaLabel: formatFichaLimit(limits),
    };
  });
}

export async function getBillingSummary(): Promise<BillingSummary | null> {
  try {
    const { supabase, membership } = await getAuthContext();
    const org = await loadOrganization(membership.organization_id);
    const plan = toBillingPlan(org.plan);

    const orgSub: OrgSubscriptionRow = {
      subscription_status: org.subscription_status,
      trial_ends_at: org.trial_ends_at,
      subscription_ended_at: org.subscription_ended_at,
      subscription_started_at: org.subscription_started_at,
      stripe_customer_id: org.stripe_customer_id,
      stripe_subscription_id: org.stripe_subscription_id,
      plan_id: org.plan_id,
    };

    const access = evaluateBillingAccess(orgSub);
    const addons = await getOrgAddonSummary(org.id, supabase);

    return {
      ...access,
      organizationId: org.id,
      organizationName: org.name,
      role: membership.role,
      stripeConfigured: isStripeConfigured(),
      plan,
      canManageBilling: membership.role === 'admin',
      subscriptionStartedAt: org.subscription_started_at,
      addonExtraUfSlots: addons.extraUfSlots,
      addonFichaCredits: addons.fichaCreditBalance,
      isFreePlan: plan?.slug === 'free',
    };
  } catch {
    return null;
  }
}

export async function createCheckoutSession(
  planSlug: PlanSlug,
): Promise<{ url: string } | { error: string }> {
  try {
    const catalog = getPlanBySlug(planSlug);
    if (!catalog?.purchasable) {
      return { error: 'Plano inválido ou não disponível para assinatura.' };
    }

    const { user, membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Apenas administradores podem assinar o plano.' };
    }
    if (!isStripeConfigured()) {
      return { error: 'Stripe não configurado. Defina STRIPE_SECRET_KEY no servidor.' };
    }

    const org = await loadOrganization(membership.organization_id);
    const targetPlan = await loadPlanBySlug(planSlug);
    const priceId = resolveMonthlyPriceId(targetPlan.stripePriceMonthlyId);
    if (!priceId) {
      return {
        error: `Price ID do Stripe não configurado para ${targetPlan.name}. Rode npm run billing:setup.`,
      };
    }

    const stripe = getStripe();
    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: org.stripe_customer_id ?? undefined,
      customer_email: org.stripe_customer_id ? undefined : user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?success=1&session_id={CHECKOUT_SESSION_ID}&plan=${planSlug}`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      client_reference_id: org.id,
      metadata: {
        organization_id: org.id,
        user_id: user.id,
        plan_id: targetPlan.id,
        plan_slug: planSlug,
      },
      subscription_data: {
        metadata: {
          organization_id: org.id,
          plan_id: targetPlan.id,
          plan_slug: planSlug,
        },
      },
    });

    if (!session.url) return { error: 'Stripe não retornou URL de checkout.' };
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao iniciar checkout' };
  }
}

export async function confirmCheckoutSession(
  sessionId: string,
): Promise<{ status: string } | { error: string }> {
  try {
    const { membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Apenas administradores podem confirmar assinatura.' };
    }
    if (!isStripeConfigured()) {
      return { error: 'Stripe não configurado.' };
    }

    const stripe = getStripe();
    const preview = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionOrgId =
      preview.metadata?.organization_id || preview.client_reference_id || null;
    if (sessionOrgId !== membership.organization_id) {
      return { error: 'Sessão de checkout inválida para esta organização.' };
    }

    await syncFromCheckoutSession(sessionId);
    const org = await loadOrganization(membership.organization_id);
    return { status: org.subscription_status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao confirmar checkout' };
  }
}

export async function listBillingAddons(): Promise<BillingAddonOption[]> {
  const stripeOk = isStripeConfigured();
  const results = await Promise.all(
    PRICING_ADDONS.map(async (addon) => {
      const priceId = await getAddonPriceId(addon.slug);
      return {
        slug: addon.slug,
        name: addon.name,
        description: addon.description,
        price: addon.price,
        unitLabel: addon.unit_label,
        billing: addon.billing,
        stripeConfigured: stripeOk && !!priceId,
      };
    }),
  );
  return results;
}

export async function createAddonCheckoutSession(
  addonSlug: AddonSlug,
): Promise<{ url: string } | { error: string }> {
  try {
    const addon = PRICING_ADDONS.find((a) => a.slug === addonSlug);
    if (!addon) return { error: 'Complemento inválido.' };

    const { user, membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Apenas administradores podem comprar complementos.' };
    }
    if (!isStripeConfigured()) {
      return { error: 'Stripe não configurado.' };
    }

    const org = await loadOrganization(membership.organization_id);
    const access = evaluateBillingAccess({
      subscription_status: org.subscription_status,
      trial_ends_at: org.trial_ends_at,
      subscription_ended_at: org.subscription_ended_at,
      subscription_started_at: org.subscription_started_at,
      stripe_customer_id: org.stripe_customer_id,
      stripe_subscription_id: org.stripe_subscription_id,
      plan_id: org.plan_id,
    });

    if (addonSlug === 'uf_extra' && !access.isActive && !access.isTrial) {
      return { error: 'O complemento +1 UF exige um plano pago ativo.' };
    }

    const priceId = await getAddonPriceId(addonSlug);
    if (!priceId) {
      return { error: `Price ID não configurado para ${addon.name}. Rode npm run billing:setup.` };
    }

    const stripe = getStripe();
    const appUrl = getAppUrl();
    const mode = addon.billing === 'recurring' ? 'subscription' : 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      customer: org.stripe_customer_id ?? undefined,
      customer_email: org.stripe_customer_id ? undefined : user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?addon_success=1&session_id={CHECKOUT_SESSION_ID}&addon=${addonSlug}`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      client_reference_id: org.id,
      metadata: {
        organization_id: org.id,
        user_id: user.id,
        addon_slug: addonSlug,
      },
      ...(mode === 'subscription'
        ? {
            subscription_data: {
              metadata: {
                organization_id: org.id,
                addon_slug: addonSlug,
              },
            },
          }
        : {}),
    });

    if (!session.url) return { error: 'Stripe não retornou URL de checkout.' };
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao iniciar checkout' };
  }
}

export async function confirmAddonCheckoutSession(
  sessionId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Apenas administradores podem confirmar compra.' };
    }
    if (!isStripeConfigured()) return { error: 'Stripe não configurado.' };

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionOrgId =
      session.metadata?.organization_id || session.client_reference_id || null;
    if (sessionOrgId !== membership.organization_id) {
      return { error: 'Sessão inválida para esta organização.' };
    }

    const { syncAddonCheckoutSession } = await import('@/lib/billing/addon-sync');
    await syncAddonCheckoutSession(session);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao confirmar compra' };
  }
}

export async function createPortalSession(): Promise<{ url: string } | { error: string }> {
  try {
    const { membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Apenas administradores podem gerenciar a assinatura.' };
    }
    if (!isStripeConfigured()) {
      return { error: 'Stripe não configurado.' };
    }

    const org = await loadOrganization(membership.organization_id);
    if (!org.stripe_customer_id) {
      return { error: 'Nenhuma assinatura Stripe encontrada para esta organização.' };
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${getAppUrl()}/billing`,
    });

    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao abrir portal' };
  }
}
