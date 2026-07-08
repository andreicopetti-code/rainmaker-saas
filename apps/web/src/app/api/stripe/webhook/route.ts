import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { syncFromCheckoutSession } from '@/lib/billing/checkout-sync';
import {
  resolveOrganizationIdFromStripe,
  syncFromStripeSubscription,
} from '@/lib/billing/sync';
import { getStripe } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET não configurado' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Assinatura ausente' }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook inválido';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment' || session.metadata?.addon_slug) {
          const { syncAddonCheckoutSession } = await import('@/lib/billing/addon-sync');
          await syncAddonCheckoutSession(session);
          break;
        }
        if (session.mode !== 'subscription') break;
        await syncFromCheckoutSession(session.id);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrganizationIdFromStripe(
          subscription,
          subscription.metadata?.organization_id,
        );
        if (!orgId) break;

        await syncFromStripeSubscription(orgId, subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (
          invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
        ).subscription;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        if (!subId) break;

        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subId);
        const orgId = await resolveOrganizationIdFromStripe(
          subscription,
          subscription.metadata?.organization_id,
        );
        if (!orgId) break;

        await syncFromStripeSubscription(orgId, subscription);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao processar webhook';
    console.error('[stripe/webhook]', event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
