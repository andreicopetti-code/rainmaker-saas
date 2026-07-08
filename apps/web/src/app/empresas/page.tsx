import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CnpjSearch } from '@/components/cnpj/CnpjSearch';
import { getEmpresaCount, getCnpjUsage, getCnpjHistory } from './actions';
import { getOrganizationUfSettings } from '@/app/configuracoes/actions';
import './empresas.css';

export default async function EmpresasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const [empresaCount, usage, history, ufSettings] = await Promise.all([
    getEmpresaCount().catch(() => 0),
    getCnpjUsage().catch(() => ({ used: 0, limit: 0, remaining: 0 } as const)),
    getCnpjHistory().catch(() => []),
    getOrganizationUfSettings().catch(() => null),
  ]);

  return (
    <div className="cnpj-page-wrap">
      <CnpjSearch
        initialCount={empresaCount}
        initialUsage={usage}
        initialHistory={history}
        initialUfSettings={ufSettings}
      />
    </div>
  );
}
