import type Stripe from 'stripe';
import { getStripe } from '@/lib/billing/stripe';
import {
  resolveDefaultPlanId,
  syncFromStripeSubscription,
  syncOrganizationBilling,
} from '@/lib/billing/sync';

/** Sincroniza org a partir de uma Checkout Session (webhook ou retorno do browser). */
export async function syncFromCheckoutSession(sessionId: string): Promise<string | null> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  const orgId =
    session.metadata?.organization_id ||
    session.client_reference_id ||
    null;
  if (!orgId) return null;

  if (session.mode === 'payment' || session.metadata?.addon_slug) {
    const { syncAddonCheckoutSession } = await import('@/lib/billing/addon-sync');
    await syncAddonCheckoutSession(session);
    return orgId;
  }

  if (session.mode !== 'subscription') return null;

  const planId = session.metadata?.plan_id || (await resolveDefaultPlanId());

  if (session.customer) {
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer.id;

    await syncOrganizationBilling({
      organizationId: orgId,
      stripeCustomerId: customerId,
      stripeSubscriptionId:
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null,
      stripeStatus: 'active',
      planId,
      subscriptionStartedAt: new Date().toISOString(),
      subscriptionEndedAt: null,
    });
  }

  const subscription = session.subscription as Stripe.Subscription | string | null;
  if (subscription) {
    const subId = typeof subscription === 'string' ? subscription : subscription.id;
    const sub = typeof subscription === 'string'
      ? await stripe.subscriptions.retrieve(subId)
      : subscription;
    await syncFromStripeSubscription(orgId, sub, planId);
  }

  return orgId;
}
