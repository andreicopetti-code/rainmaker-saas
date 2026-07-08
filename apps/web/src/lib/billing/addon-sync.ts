import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import type { AddonSlug } from '@ceo-brain/shared';

const PACK_CREDITS: Record<string, number> = {
  pack_50: 50,
  pack_200: 200,
};

export async function getAddonPriceId(slug: AddonSlug): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('billing_addon_prices')
    .select('stripe_price_id')
    .eq('slug', slug)
    .maybeSingle();

  const fromDb = data?.stripe_price_id?.trim();
  if (fromDb) return fromDb;

  const envKey = `STRIPE_${slug.toUpperCase()}_PRICE`;
  return process.env[envKey]?.trim() || null;
}

export async function addPackCredits(
  organizationId: string,
  addonSlug: AddonSlug,
): Promise<void> {
  const credits = PACK_CREDITS[addonSlug];
  if (!credits) throw new Error(`Pacote inválido: ${addonSlug}`);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('organization_addon_state')
    .select('ficha_credit_balance, extra_uf_slots, uf_extra_stripe_subscription_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const { error } = await admin.from('organization_addon_state').upsert({
    organization_id: organizationId,
    ficha_credit_balance: (existing?.ficha_credit_balance ?? 0) + credits,
    extra_uf_slots: existing?.extra_uf_slots ?? 0,
    uf_extra_stripe_subscription_id: existing?.uf_extra_stripe_subscription_id ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}

export async function syncUfExtraSubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
  active: boolean,
): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('organization_addon_state')
    .select('ficha_credit_balance, extra_uf_slots')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!active) {
    await admin.from('organization_addon_state').upsert({
      organization_id: organizationId,
      extra_uf_slots: 0,
      ficha_credit_balance: existing?.ficha_credit_balance ?? 0,
      uf_extra_stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await admin.from('organization_addon_state').upsert({
    organization_id: organizationId,
    extra_uf_slots: Math.max(existing?.extra_uf_slots ?? 0, 1),
    ficha_credit_balance: existing?.ficha_credit_balance ?? 0,
    uf_extra_stripe_subscription_id: subscription.id,
    updated_at: new Date().toISOString(),
  });
}

export async function syncAddonCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const orgId =
    session.metadata?.organization_id ||
    session.client_reference_id ||
    null;
  if (!orgId) return null;

  const addonSlug = session.metadata?.addon_slug as AddonSlug | undefined;
  if (!addonSlug) return null;

  if (session.mode === 'payment' && session.payment_status === 'paid') {
    await addPackCredits(orgId, addonSlug);
    return orgId;
  }

  if (session.mode === 'subscription' && addonSlug === 'uf_extra') {
    const subRef = session.subscription;
    if (!subRef) return orgId;
    const stripe = (await import('@/lib/billing/stripe')).getStripe();
    const subId = typeof subRef === 'string' ? subRef : subRef.id;
    const subscription = await stripe.subscriptions.retrieve(subId);
    await syncUfExtraSubscription(
      orgId,
      subscription,
      ['active', 'trialing', 'past_due'].includes(subscription.status),
    );
  }

  return orgId;
}

export async function getOrgAddonSummary(
  organizationId: string,
  supabase?: SupabaseClient<Database>,
) {
  const client = supabase ?? createAdminClient();
  const { data } = await client
    .from('organization_addon_state')
    .select('extra_uf_slots, ficha_credit_balance, uf_extra_stripe_subscription_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  return {
    extraUfSlots: data?.extra_uf_slots ?? 0,
    fichaCreditBalance: data?.ficha_credit_balance ?? 0,
    ufExtraStripeSubscriptionId: data?.uf_extra_stripe_subscription_id ?? null,
  };
}
