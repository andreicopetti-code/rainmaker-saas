import type { Database } from '@/lib/supabase/database.types';

export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];

export type OrgSubscriptionRow = {
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  subscription_ended_at: string | null;
  subscription_started_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string | null;
};

export type BillingAccess = {
  hasAccess: boolean;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  daysLeftInTrial: number | null;
  isTrial: boolean;
  isActive: boolean;
  isPastDue: boolean;
  isCanceled: boolean;
  blockReason: string | null;
  showUpgradeBanner: boolean;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function evaluateBillingAccess(org: OrgSubscriptionRow): BillingAccess {
  const status = org.subscription_status;
  const trialEndsAt = org.trial_ends_at;
  const daysLeft = daysUntil(trialEndsAt);

  if (status === 'active') {
    return {
      hasAccess: true,
      status,
      trialEndsAt,
      daysLeftInTrial: null,
      isTrial: false,
      isActive: true,
      isPastDue: false,
      isCanceled: false,
      blockReason: null,
      showUpgradeBanner: false,
    };
  }

  if (status === 'past_due') {
    return {
      hasAccess: true,
      status,
      trialEndsAt,
      daysLeftInTrial: null,
      isTrial: false,
      isActive: false,
      isPastDue: true,
      isCanceled: false,
      blockReason: null,
      showUpgradeBanner: true,
    };
  }

  if (status === 'trial') {
    const trialValid = !trialEndsAt || new Date(trialEndsAt) > new Date();
    return {
      hasAccess: trialValid,
      status,
      trialEndsAt,
      daysLeftInTrial: daysLeft,
      isTrial: true,
      isActive: false,
      isPastDue: false,
      isCanceled: false,
      blockReason: trialValid ? null : 'Seu trial de 14 dias expirou. Assine para continuar usando o CEO Brain.',
      showUpgradeBanner: trialValid && daysLeft !== null && daysLeft <= 3,
    };
  }

  return {
    hasAccess: false,
    status,
    trialEndsAt,
    daysLeftInTrial: null,
    isTrial: false,
    isActive: false,
    isPastDue: false,
    isCanceled: true,
    blockReason: 'Assinatura cancelada. Renove para voltar a usar o CEO Brain.',
    showUpgradeBanner: true,
  };
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string,
): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'trialing':
      return 'trial';
    default:
      return 'past_due';
  }
}
