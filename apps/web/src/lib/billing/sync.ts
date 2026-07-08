import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapStripeSubscriptionStatus } from '@/lib/billing/subscription';
import type { Database } from '@/lib/supabase/database.types';

type OrgUpdate = Database['public']['Tables']['organizations']['Update'];

type SyncInput = {
  organizationId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeStatus?: string | null;
  planId?: string | null;
  subscriptionStartedAt?: string | null;
  subscriptionEndedAt?: string | null;
};

export async function syncOrganizationBilling(input: SyncInput): Promise<void> {
  const admin = createAdminClient();
  const payload: OrgUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (input.stripeCustomerId !== undefined) {
    payload.stripe_customer_id = input.stripeCustomerId;
  }
  if (input.stripeSubscriptionId !== undefined) {
    payload.stripe_subscription_id = input.stripeSubscriptionId;
  }
  if (input.stripeStatus) {
    payload.subscription_status = mapStripeSubscriptionStatus(input.stripeStatus);
  }
  if (input.planId) {
    payload.plan_id = input.planId;
  }
  if (input.subscriptionStartedAt !== undefined) {
    payload.subscription_started_at = input.subscriptionStartedAt;
  }
  if (input.subscriptionEndedAt !== undefined) {
    payload.subscription_ended_at = input.subscriptionEndedAt;
  }

  const { error } = await admin
    .from('organizations')
    .update(payload)
    .eq('id', input.organizationId);

  if (error) throw new Error(error.message);
}

export async function resolveFreePlanId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plans')
    .select('id')
    .contains('features', { slug: 'free' })
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolvePlanIdFromStripePrice(priceId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plans')
    .select('id')
    .eq('stripe_price_monthly_id', priceId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolvePlanIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metaPlanId = subscription.metadata?.plan_id?.trim();
  if (metaPlanId) return metaPlanId;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId) {
    const fromPrice = await resolvePlanIdFromStripePrice(priceId);
    if (fromPrice) return fromPrice;
  }

  return resolveDefaultPlanId();
}

/** Downgrade org to Free after paid subscription ends — keeps app access with Free limits. */
export async function applyDowngradeToFree(
  organizationId: string,
  endedAt: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const freePlanId = await resolveFreePlanId();
  if (!freePlanId) throw new Error('Plano Free não encontrado no banco');

  await syncOrganizationBilling({
    organizationId,
    planId: freePlanId,
    stripeStatus: 'active',
    stripeSubscriptionId: null,
    subscriptionEndedAt: endedAt,
  });

  await admin
    .from('organization_allowed_ufs')
    .delete()
    .eq('organization_id', organizationId);

  const { data: addonState } = await admin
    .from('organization_addon_state')
    .select('ficha_credit_balance')
    .eq('organization_id', organizationId)
    .maybeSingle();

  await admin.from('organization_addon_state').upsert({
    organization_id: organizationId,
    extra_uf_slots: 0,
    ficha_credit_balance: addonState?.ficha_credit_balance ?? 0,
    uf_extra_stripe_subscription_id: null,
    updated_at: new Date().toISOString(),
  });
}

export async function syncFromStripeSubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
  planId?: string | null,
): Promise<void> {
  const addonSlug = subscription.metadata?.addon_slug;

  if (addonSlug === 'uf_extra') {
    const { syncUfExtraSubscription } = await import('@/lib/billing/addon-sync');
    const active = ['active', 'trialing', 'past_due'].includes(subscription.status);
    await syncUfExtraSubscription(organizationId, subscription, active);
    return;
  }

  const isCanceled =
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired';

  if (isCanceled) {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from('organizations')
      .select('stripe_subscription_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (org?.stripe_subscription_id === subscription.id) {
      const endedAt =
        subscription.ended_at
          ? new Date(subscription.ended_at * 1000).toISOString()
          : new Date().toISOString();
      await applyDowngradeToFree(organizationId, endedAt);
    }
    return;
  }

  const startedAt = subscription.start_date
    ? new Date(subscription.start_date * 1000).toISOString()
    : new Date().toISOString();

  const resolvedPlanId =
    planId ?? (await resolvePlanIdFromSubscription(subscription));

  await syncOrganizationBilling({
    organizationId,
    stripeCustomerId:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id ?? null,
    stripeSubscriptionId: subscription.id,
    stripeStatus: subscription.status,
    planId: resolvedPlanId ?? undefined,
    subscriptionStartedAt: startedAt,
    subscriptionEndedAt: null,
  });
}

export async function resolveOrganizationIdFromStripe(
  subscription: Stripe.Subscription,
  sessionOrgId?: string | null,
): Promise<string | null> {
  if (sessionOrgId) return sessionOrgId;
  const metaOrg = subscription.metadata?.organization_id;
  if (metaOrg) return metaOrg;

  const admin = createAdminClient();
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return null;

  const { data } = await admin
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.id ?? null;
}

export async function resolveDefaultPlanId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plans')
    .select('id')
    .contains('features', { slug: 'regional_1' })
    .maybeSingle();
  if (data?.id) return data.id;

  const { data: fallback } = await admin
    .from('plans')
    .select('id')
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return fallback?.id ?? null;
}
