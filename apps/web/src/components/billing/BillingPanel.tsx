'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  confirmCheckoutSession,
  confirmAddonCheckoutSession,
  createAddonCheckoutSession,
  createCheckoutSession,
  createPortalSession,
  type BillingAddonOption,
  type BillingPlanOption,
  type BillingSummary,
} from '@/app/billing/actions';
import type { PlanSlug } from '@ceo-brain/shared';
import { OrganizationUfSelector } from '@/components/settings/OrganizationUfSelector';
import type { OrganizationUfSettings } from '@/app/configuracoes/actions';

type Props = {
  summary: BillingSummary;
  plans: BillingPlanOption[];
  addons: BillingAddonOption[];
  ufSettings?: OrganizationUfSettings | null;
};

function statusLabel(summary: BillingSummary): string {
  if (summary.isFreePlan && summary.isActive) return 'Plano Free';
  if (summary.isActive) return 'Assinatura ativa';
  if (summary.isPastDue) return 'Pagamento pendente';
  if (summary.isTrial) {
    if (!summary.hasAccess) return 'Trial expirado';
    if (summary.daysLeftInTrial === null) return 'Trial ativo';
    if (summary.daysLeftInTrial === 0) return 'Trial expira hoje';
    return `Trial — ${summary.daysLeftInTrial} dia${summary.daysLeftInTrial === 1 ? '' : 's'} restante${summary.daysLeftInTrial === 1 ? '' : 's'}`;
  }
  return 'Assinatura cancelada';
}

function statusClass(summary: BillingSummary): string {
  if (summary.isActive) return 'billing-status billing-status--active';
  if (summary.isPastDue) return 'billing-status billing-status--warn';
  if (summary.isTrial && summary.hasAccess) return 'billing-status billing-status--trial';
  return 'billing-status billing-status--blocked';
}

function isPlanSlug(value: string | null): value is PlanSlug {
  return value === 'regional_1' || value === 'regional_3' || value === 'nacional';
}

export function BillingPanel({ summary, plans, addons, ufSettings = null }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get('success') === '1';
  const addonSuccess = searchParams.get('addon_success') === '1';
  const sessionId = searchParams.get('session_id');
  const addonConfirmed = searchParams.get('addon_confirmed') === '1';
  const canceled = searchParams.get('canceled') === '1';
  const planFromUrl = searchParams.get('plan');

  const processedSessionRef = useRef<string | null>(null);

  const defaultSlug = useMemo(() => {
    if (isPlanSlug(planFromUrl)) return planFromUrl;
    return summary.plan?.slug && summary.plan.slug !== 'free'
      ? summary.plan.slug
      : 'regional_1';
  }, [planFromUrl, summary.plan?.slug]);

  const [selectedSlug, setSelectedSlug] = useState<PlanSlug>(defaultSlug);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState<'checkout' | 'portal' | null>(null);
  const [, startTransition] = useTransition();

  const selectedPlan = plans.find((p) => p.slug === selectedSlug) ?? plans[0];

  useEffect(() => {
    if (isPlanSlug(planFromUrl)) setSelectedSlug(planFromUrl);
  }, [planFromUrl]);

  useEffect(() => {
    if (!success || !sessionId || summary.isActive) return;
    if (processedSessionRef.current === sessionId) return;

    let cancelled = false;
    let attempts = 0;
    setConfirming(true);

    async function confirm() {
      if (cancelled) return;
      if (attempts >= 15) {
        setConfirming(false);
        setError('Pagamento recebido, mas a ativação demorou. Recarregue a página.');
        return;
      }
      attempts += 1;

      const result = await confirmCheckoutSession(sessionId!);
      if (cancelled) return;
      if ('error' in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      if (result.status === 'active' || result.status === 'past_due') {
        processedSessionRef.current = sessionId!;
        setConfirming(false);
        router.replace('/billing');
        return;
      }
      setTimeout(confirm, 2000);
    }

    void confirm();
    return () => { cancelled = true; };
  }, [success, sessionId, summary.isActive, router]);

  useEffect(() => {
    if (!addonSuccess || !sessionId) return;
    const key = `addon:${sessionId}`;
    if (processedSessionRef.current === key) return;

    let cancelled = false;
    setConfirming(true);
    processedSessionRef.current = key;

    void (async () => {
      const result = await confirmAddonCheckoutSession(sessionId);
      if (cancelled) return;
      setConfirming(false);
      if ('error' in result) {
        processedSessionRef.current = null;
        setError(result.error);
        return;
      }
      router.replace('/billing?addon_confirmed=1');
    })();

    return () => { cancelled = true; };
  }, [addonSuccess, sessionId, router]);

  async function handleAddonCheckout(slug: BillingAddonOption['slug']) {
    setError(null);
    setLoading('checkout');
    const result = await createAddonCheckoutSession(slug);
    setLoading(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  async function handleCheckout() {
    if (!selectedPlan) return;
    setError(null);
    setLoading('checkout');
    const result = await createCheckoutSession(selectedPlan.slug);
    setLoading(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  async function handlePortal() {
    setError(null);
    setLoading('portal');
    const result = await createPortalSession();
    setLoading(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  const canSubscribe =
    summary.canManageBilling &&
    summary.stripeConfigured &&
    selectedPlan?.stripeConfigured &&
    (summary.isTrial || summary.isFreePlan || !summary.isActive);

  return (
    <div className="billing-page">
      <div className="billing-header">
        <div>
          <h1>Plano e assinatura</h1>
          <p className="billing-sub">
            Organização: <strong>{summary.organizationName}</strong>
            {' · '}
            <Link href="/precos" className="billing-link">Ver todos os planos</Link>
          </p>
        </div>
        {summary.hasAccess && (
          <div className="billing-header-actions">
            <Link href="/funil" className="btn-primary billing-btn">
              Ir para o funil
            </Link>
          </div>
        )}
      </div>

      {success && (
        <div className="billing-alert billing-alert--success">
          {confirming && !summary.isActive
            ? 'Confirmando pagamento…'
            : (
              <>
                Pagamento recebido! Sua assinatura está ativa.{' '}
                {summary.hasAccess && (
                  <Link href="/funil" className="billing-link">
                    Ir para o funil →
                  </Link>
                )}
              </>
            )}
        </div>
      )}
      {addonSuccess && (
        <div className="billing-alert billing-alert--success">
          {confirming ? 'Confirmando complemento…' : 'Complemento ativado com sucesso.'}
        </div>
      )}
      {addonConfirmed && !addonSuccess && (
        <div className="billing-alert billing-alert--success">
          Complemento ativado com sucesso.
        </div>
      )}
      {canceled && (
        <div className="billing-alert billing-alert--info">
          Checkout cancelado. Você pode assinar quando quiser.
        </div>
      )}
      {error && <div className="billing-alert billing-alert--error">{error}</div>}
      {!summary.hasAccess && summary.blockReason && (
        <div className="billing-alert billing-alert--error">{summary.blockReason}</div>
      )}

      {ufSettings?.needsSelection && (summary.isActive || summary.isTrial) && (
        <div style={{ marginBottom: 16 }}>
          <OrganizationUfSelector
            settings={ufSettings}
            onSaved={() => startTransition(() => router.refresh())}
          />
        </div>
      )}

      <div className="billing-grid">
        <section className="billing-card">
          <div className="billing-card-label">Status atual</div>
          <div className={statusClass(summary)}>{statusLabel(summary)}</div>
          {summary.plan && (
            <p className="billing-meta">
              Plano atual: <strong>{summary.plan.name}</strong>
            </p>
          )}
          {summary.isTrial && summary.trialEndsAt && (
            <p className="billing-meta">
              Expira em{' '}
              {new Date(summary.trialEndsAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
          {summary.isActive && summary.subscriptionStartedAt && !summary.isFreePlan && (
            <p className="billing-meta">
              Cliente desde{' '}
              {new Date(summary.subscriptionStartedAt).toLocaleDateString('pt-BR')}
            </p>
          )}
          {(summary.addonExtraUfSlots > 0 || summary.addonFichaCredits > 0) && (
            <p className="billing-meta">
              Complementos:
              {summary.addonExtraUfSlots > 0 && ` +${summary.addonExtraUfSlots} UF`}
              {summary.addonFichaCredits > 0 && ` · ${summary.addonFichaCredits} fichas em crédito`}
            </p>
          )}
          {summary.isFreePlan && (
            <p className="billing-meta">
              Após cancelar a assinatura paga, você continua no Free com limites reduzidos.
            </p>
          )}
        </section>

        <section className="billing-card billing-card--plan billing-card--wide">
          <div className="billing-card-label">Escolha o plano</div>

          {!summary.stripeConfigured && (
            <p className="billing-hint billing-hint--warn">
              Stripe ainda não configurado (STRIPE_SECRET_KEY).
            </p>
          )}

          <div className="billing-plan-picker">
            {plans.map((plan) => (
              <button
                key={plan.slug}
                type="button"
                className={`billing-plan-option${selectedSlug === plan.slug ? ' selected' : ''}${!plan.stripeConfigured ? ' disabled' : ''}`}
                onClick={() => setSelectedSlug(plan.slug)}
              >
                <span className="billing-plan-option-name">{plan.name}</span>
                <span className="billing-plan-option-price">R$ {plan.priceMonthly}/mês</span>
                <span className="billing-plan-option-meta">{plan.ufLabel}</span>
                <span className="billing-plan-option-meta">{plan.fichaLabel}</span>
              </button>
            ))}
          </div>

          {selectedPlan && (
            <ul className="billing-features">
              {selectedPlan.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}

          {summary.stripeConfigured && selectedPlan && !selectedPlan.stripeConfigured && (
            <p className="billing-hint billing-hint--warn">
              Price ID do Stripe ausente para {selectedPlan.name}. Rode npm run billing:setup.
            </p>
          )}

          <div className="billing-actions">
            {canSubscribe && (
              <button
                type="button"
                className="btn-primary billing-btn"
                disabled={loading !== null}
                onClick={() => startTransition(() => void handleCheckout())}
              >
                {loading === 'checkout' ? 'Redirecionando…' : `Assinar ${selectedPlan?.name ?? ''}`}
              </button>
            )}

            {summary.canManageBilling && summary.isActive && summary.stripeConfigured && (
              <button
                type="button"
                className="btn-ghost billing-btn"
                disabled={loading !== null}
                onClick={() => startTransition(() => void handlePortal())}
              >
                {loading === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura'}
              </button>
            )}

            {!summary.canManageBilling && (
              <p className="billing-hint">
                Apenas administradores podem assinar ou alterar o plano.
              </p>
            )}
          </div>
        </section>

        {addons.length > 0 && (
          <section className="billing-card billing-card--wide">
            <div className="billing-card-label">Complementos</div>
            <div className="billing-addon-grid">
              {addons.map((addon) => (
                <div key={addon.slug} className="billing-addon-card">
                  <div className="billing-addon-name">{addon.name}</div>
                  <div className="billing-addon-price">
                    R$ {addon.price}
                    <span>{addon.unitLabel}</span>
                  </div>
                  <p className="billing-addon-desc">{addon.description}</p>
                  {summary.canManageBilling && (
                    <button
                      type="button"
                      className="btn-ghost billing-btn"
                      disabled={!addon.stripeConfigured || loading !== null}
                      onClick={() => startTransition(() => void handleAddonCheckout(addon.slug))}
                    >
                      Comprar
                    </button>
                  )}
                  {!addon.stripeConfigured && (
                    <p className="billing-hint">Configure no Stripe (billing:setup).</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="billing-footer">
        {summary.hasAccess ? (
          <Link href="/funil" className="billing-link">
            ← Voltar ao funil
          </Link>
        ) : (
          <>
            <span className="billing-footer-hint">
              O acesso ao funil fica bloqueado até assinar ou renovar o trial.
            </span>
            {' · '}
            <form action="/auth/signout" method="post" className="billing-signout">
              <button type="submit" className="billing-link billing-link--btn">
                Sair da conta
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
