'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createTeamInvite,
  revokeTeamInvite,
  updateOrganizationName,
  type TeamOverview,
} from '@/app/configuracoes/team-actions';

type Props = {
  initial: TeamOverview;
};

export function OrganizationTeamPanel({ initial }: Props) {
  const router = useRouter();
  const [team, setTeam] = useState(initial);
  const [orgName, setOrgName] = useState(initial.organizationName);
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = team.viewerRole === 'admin';
  const nameDirty = orgName.trim() !== team.organizationName;

  function handleSaveName() {
    setError(null);
    setNameSuccess(null);
    startTransition(async () => {
      const result = await updateOrganizationName(orgName);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setOrgName(result.organizationName);
      setTeam((prev) => ({ ...prev, organizationName: result.organizationName }));
      setNameSuccess('Nome da equipe atualizado.');
      setTimeout(() => setNameSuccess(null), 3000);
      router.refresh();
    });
  }

  function handleInvite() {
    setError(null);
    setInviteSuccess(null);
    startTransition(async () => {
      const result = await createTeamInvite(inviteEmail);
      if ('error' in result) {
        setError(result.error);
        return;
      }

      setInviteEmail('');
      setTeam((prev) => ({
        ...prev,
        canInvite: prev.memberCount + prev.pendingInvites.length + 1 < prev.memberLimit,
        pendingInvites: [
          {
            id: `temp-${Date.now()}`,
            token: '',
            email: result.email,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            inviteUrl: result.inviteUrl,
          },
          ...prev.pendingInvites,
        ],
      }));

      if (result.emailSent) {
        setInviteSuccess(`Convite enviado para ${result.email}.`);
      } else {
        setInviteSuccess(result.warning ?? `Convite criado para ${result.email}.`);
        try {
          await navigator.clipboard.writeText(result.inviteUrl);
          setCopied(result.inviteUrl);
          setTimeout(() => setCopied(null), 4000);
        } catch {
          /* link continua disponível em pendentes */
        }
      }

      setTimeout(() => setInviteSuccess(null), 5000);
      router.refresh();
    });
  }

  function handleRevoke(inviteId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeTeamInvite(inviteId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setTeam((prev) => ({
        ...prev,
        pendingInvites: prev.pendingInvites.filter((i) => i.id !== inviteId),
        canInvite: prev.memberCount + prev.pendingInvites.length - 1 < prev.memberLimit,
      }));
      router.refresh();
    });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 3000);
    } catch {
      setError('Não foi possível copiar o link.');
    }
  }

  return (
    <section className="settings-team-card">
      <div className="settings-team-head">
        <div>
          <h2 className="settings-team-title">Equipe</h2>
          <p className="settings-team-sub">
            {team.memberCount} de {team.memberLimit} usuário(s)
            {isAdmin ? ' · convites expiram em 7 dias' : ''}
          </p>
        </div>
      </div>

      {isAdmin ? (
        <div className="settings-team-name-block">
          <label className="settings-team-name-label" htmlFor="team-name">
            Nome da equipe
          </label>
          <div className="settings-team-name-row">
            <input
              id="team-name"
              type="text"
              className="settings-team-name-input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Copetti Santos"
              disabled={isPending}
            />
            <button
              type="button"
              className="settings-team-name-btn"
              onClick={handleSaveName}
              disabled={!nameDirty || isPending || orgName.trim().length < 2}
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          <p className="settings-team-name-hint">
            Aparece em convites, billing e para os membros da equipe.
          </p>
        </div>
      ) : (
        <p className="settings-team-name-readonly">
          Equipe: <strong>{team.organizationName}</strong>
        </p>
      )}

      {isAdmin && (
        <div className="settings-team-invite-block">
          <label className="settings-team-name-label" htmlFor="invite-email">
            Convidar por e-mail
          </label>
          <div className="settings-team-name-row">
            <input
              id="invite-email"
              type="email"
              className="settings-team-name-input"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="nome@empresa.com"
              disabled={!team.canInvite || isPending}
              autoComplete="email"
            />
            <button
              type="button"
              className="settings-team-invite-btn"
              onClick={handleInvite}
              disabled={!team.canInvite || isPending || !inviteEmail.trim()}
            >
              {isPending ? 'Enviando…' : 'Enviar convite'}
            </button>
          </div>
          <p className="settings-team-name-hint">
            O convidado recebe um e-mail com o link. Você também pode copiar o link depois.
          </p>
        </div>
      )}

      {error && <div className="settings-team-error">{error}</div>}
      {nameSuccess && <div className="settings-team-success">{nameSuccess}</div>}
      {inviteSuccess && <div className="settings-team-success">{inviteSuccess}</div>}
      {copied && (
        <div className="settings-team-success">
          Link copiado — envie para o convidado se precisar.
        </div>
      )}

      {!isAdmin && (
        <p className="settings-team-sub settings-team-member-note">
          Você entrou como membro. Somente o administrador pode convidar ou renomear a equipe.
        </p>
      )}

      <ul className="settings-team-list">
        {team.members.map((m) => (
          <li key={m.id} className="settings-team-item">
            <div>
              <div className="settings-team-name">{m.name || m.email || 'Usuário'}</div>
              {m.email && m.name && <div className="settings-team-email">{m.email}</div>}
            </div>
            <span className="settings-team-role">
              {m.role === 'admin' ? 'Administrador' : 'Membro'}
            </span>
          </li>
        ))}
      </ul>

      {team.pendingInvites.length > 0 && isAdmin && (
        <div className="settings-team-pending">
          <div className="settings-team-pending-label">Convites pendentes</div>
          {team.pendingInvites.map((invite) => (
            <div key={invite.id} className="settings-team-pending-row">
              <div className="settings-team-pending-info">
                <span className="settings-team-pending-email">
                  {invite.email || 'Sem e-mail'}
                </span>
                <span className="settings-team-expires">
                  expira {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <button
                type="button"
                className="settings-team-link-btn"
                onClick={() => copyLink(invite.inviteUrl)}
              >
                Copiar link
              </button>
              {!invite.id.startsWith('temp-') && (
                <button
                  type="button"
                  className="settings-team-revoke-btn"
                  onClick={() => handleRevoke(invite.id)}
                  disabled={isPending}
                >
                  Revogar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
