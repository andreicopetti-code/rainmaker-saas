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

  const withDeadline = <T,>(p: Promise<T>, fallback: T, ms = 8_000) =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [empresaCount, usage, history, ufSettings] = await Promise.all([
    withDeadline(getEmpresaCount().catch(() => 0), 0),
    withDeadline(
      getCnpjUsage().catch(() => ({ used: 0, limit: 0, remaining: 0 } as const)),
      { used: 0, limit: 0, remaining: 0 } as const,
    ),
    withDeadline(getCnpjHistory().catch(() => []), []),
    withDeadline(getOrganizationUfSettings().catch(() => null), null),
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
