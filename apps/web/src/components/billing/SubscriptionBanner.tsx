'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBillingSummary, type BillingSummary } from '@/app/billing/actions';

export function SubscriptionBanner() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    void getBillingSummary().then(setSummary);
  }, []);

  if (!summary) return null;

  if (!summary.hasAccess && summary.blockReason) {
    return (
      <div className="subscription-banner subscription-banner--danger">
        <span className="subscription-banner-text">{summary.blockReason}</span>
        {summary.canManageBilling ? (
          <Link href="/billing" className="subscription-banner-btn">
            Assinar agora
          </Link>
        ) : (
          <span className="subscription-banner-text" style={{ fontSize: 12 }}>
            Fale com o admin da conta.
          </span>
        )}
      </div>
    );
  }

  if (summary.isPastDue) {
    return (
      <div className="subscription-banner subscription-banner--danger">
        <span className="subscription-banner-text">
          Pagamento pendente — atualize seu cartão para evitar interrupção.
        </span>
        {summary.canManageBilling && (
          <Link href="/billing" className="subscription-banner-btn">
            Regularizar
          </Link>
        )}
      </div>
    );
  }

  if (summary.showUpgradeBanner && summary.isTrial) {
    const days = summary.daysLeftInTrial ?? 0;
    return (
      <div className="subscription-banner">
        <span className="subscription-banner-text">
          {days === 0
            ? 'Seu trial expira hoje.'
            : `Seu trial expira em ${days} dia${days === 1 ? '' : 's'}.`}
          {' '}Assine para não perder seus deals.
        </span>
        {summary.canManageBilling && (
          <Link href="/billing" className="subscription-banner-btn">
            Ver planos
          </Link>
        )}
      </div>
    );
  }

  return null;
}
