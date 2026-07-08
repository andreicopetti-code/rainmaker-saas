import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getOrgPlanContext } from '@/lib/billing/org-plan-limits';
import { PlanUpgradeGate } from '@/components/billing/PlanUpgradeGate';
import { EmailsView } from '@/components/emails/EmailsView';
import { getEmailsData } from './actions';
import './emails.css';

export default async function EmailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const orgId = orgRows?.[0]?.organization_id;
  if (!orgId) redirect('/login');

  const planCtx = await getOrgPlanContext(supabase, orgId);
  if (!planCtx.limits.emails_enabled) {
    return <PlanUpgradeGate feature="E-mails integrados" planName={planCtx.planName} />;
  }

  const data = await getEmailsData();
  if (!data) redirect('/login');

  return (
    <Suspense fallback={null}>
      <EmailsView data={data} />
    </Suspense>
  );
}
