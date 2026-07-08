import { createClient } from '@/lib/supabase/server';
import { getInvitePreview } from '@/app/configuracoes/team-actions';
import { AcceptInviteClient } from './AcceptInviteClient';
import './invite.css';

type Props = {
  params: Promise<{ token: string }>;
};

export default async function ConvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preview = await getInvitePreview(token, user?.id ?? null);

  if (!preview) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <h1>Convite inválido</h1>
          <p>Este link não existe ou já foi removido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <h1>Convite para equipe</h1>
        <p className="invite-org">
          Você foi convidado para entrar na equipe{' '}
          <strong>{preview.organizationName}</strong>.
        </p>
        <AcceptInviteClient
          token={token}
          organizationName={preview.organizationName}
          expired={preview.expired}
          used={preview.used}
          alreadyMember={preview.alreadyMember}
          isLoggedIn={!!user}
        />
      </div>
    </div>
  );
}
