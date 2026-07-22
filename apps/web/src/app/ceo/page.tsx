import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUpgradeGate } from '@/components/billing/PlanUpgradeGate';
import { getCeoPageData } from './actions';
import { CeoChat } from '@/components/ceo/CeoChat';

export default async function CeoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const result = await getCeoPageData();

  if ('error' in result) {
    return (
      <div className="board-page">
        <div style={{ margin: 24, padding: 20, borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', fontSize: 14 }}>
          <strong>Erro ao carregar o RainMaker IA:</strong> {result.error}
        </div>
      </div>
    );
  }

  if (!result.ceoBrainEnabled) {
    return <PlanUpgradeGate feature="RainMaker IA" planName={result.planName} />;
  }

  return (
    <div className="board-page">
      <CeoChat pageData={result} />
    </div>
  );
}
