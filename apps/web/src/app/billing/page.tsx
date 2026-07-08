import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getBillingSummary, listBillingAddons, listBillingPlans } from './actions';
import { getOrganizationUfSettings } from '@/app/configuracoes/actions';
import { BillingPanel } from '@/components/billing/BillingPanel';
import './billing.css';
import '@/components/settings/organization-uf.css';

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/billing');

  const summary = await getBillingSummary();
  if (!summary) {
    return (
      <div className="billing-page" style={{ padding: 24 }}>
        <div className="billing-alert billing-alert--error">
          Não foi possível carregar os dados de assinatura. Recarregue a página ou tente novamente em instantes.
        </div>
      </div>
    );
  }

  const [plans, addons, ufSettings] = await Promise.all([
    listBillingPlans(),
    listBillingAddons(),
    getOrganizationUfSettings().catch(() => null),
  ]);

  return (
    <Suspense fallback={<div className="billing-page" style={{ padding: 24 }}>Carregando…</div>}>
      <BillingPanel summary={summary} plans={plans} addons={addons} ufSettings={ufSettings} />
    </Suspense>
  );
}
