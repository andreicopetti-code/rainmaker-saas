'use client';

import { useState } from 'react';
import Link from 'next/link';
import { acceptTeamInvite } from '@/app/configuracoes/team-actions';

type Props = {
  token: string;
  organizationName: string;
  expired: boolean;
  used: boolean;
  alreadyMember: boolean;
  isLoggedIn: boolean;
};

export function AcceptInviteClient({
  token,
  organizationName,
  expired,
  used,
  alreadyMember,
  isLoggedIn,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleAccept() {
    setError(null);
    setIsPending(true);
    try {
      const result = await acceptTeamInvite(token);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      window.location.assign('/funil');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar convite');
    } finally {
      setIsPending(false);
    }
  }

  if (used) {
    return <p className="invite-msg invite-msg--warn">Este convite já foi utilizado.</p>;
  }
  if (expired) {
    return <p className="invite-msg invite-msg--warn">Este convite expirou. Peça um novo ao administrador.</p>;
  }

  if (alreadyMember) {
    return (
      <div className="invite-actions">
        <p className="invite-msg">Você já faz parte da equipe <strong>{organizationName}</strong>.</p>
        <Link href="/funil" className="invite-btn invite-btn--primary">
          Ir para o funil
        </Link>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="invite-actions">
        <p className="invite-msg">Faça login ou crie uma conta para entrar na equipe.</p>
        <Link
          href={`/login?redirect=${encodeURIComponent(`/convite/${token}`)}`}
          className="invite-btn invite-btn--primary"
        >
          Entrar para aceitar
        </Link>
        <Link href={`/register?redirect=${encodeURIComponent(`/convite/${token}`)}`} className="invite-btn">
          Criar conta
        </Link>
      </div>
    );
  }

  return (
    <div className="invite-actions">
      {error && (
        <div className="invite-error-banner" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="invite-btn invite-btn--primary"
        onClick={() => void handleAccept()}
        disabled={isPending}
      >
        {isPending ? 'Aceitando…' : 'Aceitar convite'}
      </button>
    </div>
  );
}
