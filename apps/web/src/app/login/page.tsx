import { Suspense } from 'react';
import { getInvitePreview } from '@/app/configuracoes/team-actions';
import { LoginForm } from './LoginForm';

type Props = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { redirect } = await searchParams;
  let inviteOrganizationName: string | null = null;

  if (redirect?.startsWith('/convite/')) {
    const token = redirect.slice('/convite/'.length).split('?')[0];
    if (token) {
      const preview = await getInvitePreview(token).catch(() => null);
      inviteOrganizationName = preview?.organizationName ?? null;
    }
  }

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Carregando…</div>}>
      <LoginForm inviteOrganizationName={inviteOrganizationName} />
    </Suspense>
  );
}
