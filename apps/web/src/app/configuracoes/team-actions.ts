'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/billing/stripe';
import { normalizeInviteEmail, sendTeamInviteEmail } from '@/lib/email/team-invite';

export type TeamMemberRow = {
  id: string;
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  acceptedAt: string | null;
};

export type PendingInviteRow = {
  id: string;
  token: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
  inviteUrl: string;
};

export type TeamOverview = {
  organizationName: string;
  viewerRole: string;
  memberCount: number;
  memberLimit: number;
  canInvite: boolean;
  members: TeamMemberRow[];
  pendingInvites: PendingInviteRow[];
};

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', {
    p_user_id: user.id,
  });
  const membership = orgRows?.[0];
  if (!membership) throw new Error('Organização não encontrada');

  return { supabase, user, membership };
}

async function loadMemberLimit(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_org_member_limit', {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 1;
}

async function loadMemberCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('org_active_member_count', {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function getTeamOverview(): Promise<TeamOverview | null> {
  try {
    const { membership } = await getAuthContext();
    const orgId = membership.organization_id;
    const admin = createAdminClient();

    const [{ data: orgRow }, memberCount, memberLimit] = await Promise.all([
      admin.from('organizations').select('name').eq('id', orgId).single(),
      loadMemberCount(orgId),
      loadMemberLimit(orgId),
    ]);

    const { data: memberRows, error: membersErr } = await admin
      .from('organization_members')
      .select('id, user_id, role, accepted_at')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: true });

    if (membersErr) throw new Error(membersErr.message);

    const userIds = (memberRows ?? []).map((m) => m.user_id);
    const nameByUser = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      for (const p of profiles ?? []) {
        nameByUser.set(p.id, p.full_name);
      }
    }

    const emailByUser = new Map<string, string | null>();
    if (userIds.length > 0) {
      for (const uid of userIds) {
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        emailByUser.set(uid, authUser.user?.email ?? null);
      }
    }

    const members: TeamMemberRow[] = (memberRows ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      name: nameByUser.get(m.user_id) ?? null,
      email: emailByUser.get(m.user_id) ?? null,
      acceptedAt: m.accepted_at,
    }));

    let pendingInvites: PendingInviteRow[] = [];
    if (membership.role === 'admin') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inviteRows } = await (admin as any)
        .from('invite_tokens')
        .select('id, token, invited_email, expires_at, created_at')
        .eq('organization_id', orgId)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      const appUrl = getAppUrl();
      pendingInvites = ((inviteRows ?? []) as Array<{
        id: string;
        token: string;
        invited_email: string | null;
        expires_at: string;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        token: row.token,
        email: row.invited_email,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        inviteUrl: `${appUrl}/convite/${row.token}`,
      }));
    }

    const seatsUsed = memberCount + pendingInvites.length;

    return {
      organizationName: orgRow?.name ?? 'Organização',
      viewerRole: membership.role,
      memberCount,
      memberLimit,
      canInvite: membership.role === 'admin' && seatsUsed < memberLimit,
      members,
      pendingInvites,
    };
  } catch {
    return null;
  }
}

export async function updateOrganizationName(
  name: string,
): Promise<{ ok: true; organizationName: string } | { error: string }> {
  try {
    const { supabase, membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Somente administradores podem renomear a equipe.' };
    }

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { error: 'O nome da equipe precisa ter pelo menos 2 caracteres.' };
    }
    if (trimmed.length > 80) {
      return { error: 'O nome da equipe pode ter no máximo 80 caracteres.' };
    }

    const { error } = await supabase
      .from('organizations')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', membership.organization_id);

    if (error) return { error: error.message };

    revalidatePath('/configuracoes');
    revalidatePath('/billing');
    return { ok: true, organizationName: trimmed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar nome da equipe' };
  }
}

export async function createTeamInvite(
  emailInput: string,
): Promise<
  | { inviteUrl: string; email: string; emailSent: boolean; warning?: string }
  | { error: string }
> {
  try {
    const { supabase, user, membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Somente administradores podem convidar membros.' };
    }

    const email = normalizeInviteEmail(emailInput);
    if (!email) {
      return { error: 'Informe um e-mail válido para enviar o convite.' };
    }

    const orgId = membership.organization_id;
    const [memberCount, memberLimit] = await Promise.all([
      loadMemberCount(orgId),
      loadMemberLimit(orgId),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: pendingCount } = await (supabase as any)
      .from('invite_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString());

    if (memberCount + (pendingCount ?? 0) >= memberLimit) {
      return {
        error: `Limite de ${memberLimit} usuário(s) atingido no seu plano. Faça upgrade para convidar mais pessoas.`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: duplicateInvite } = await (supabase as any)
      .from('invite_tokens')
      .select('id')
      .eq('organization_id', orgId)
      .eq('invited_email', email)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (duplicateInvite) {
      return { error: 'Já existe um convite pendente para este e-mail.' };
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inviteUrl = `${getAppUrl()}/convite/${token}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('invite_tokens').insert({
      organization_id: orgId,
      token,
      created_by: user.id,
      expires_at: expiresAt,
      invited_email: email,
    });

    if (error) return { error: error.message };

    const admin = createAdminClient();
    const [{ data: orgRow }, { data: profile }] = await Promise.all([
      admin.from('organizations').select('name').eq('id', orgId).single(),
      admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);

    const emailResult = await sendTeamInviteEmail({
      to: email,
      organizationName: orgRow?.name ?? 'Organização',
      inviterName: profile?.full_name ?? user.email ?? null,
      inviterEmail: user.email ?? null,
      inviteUrl,
      expiresAt,
    });

    revalidatePath('/configuracoes');
    revalidatePath('/billing');

    if (!emailResult.ok) {
      return {
        inviteUrl,
        email,
        emailSent: false,
        warning: `Convite criado, mas o e-mail não foi enviado (${emailResult.error}). Copie o link abaixo.`,
      };
    }

    return { inviteUrl, email, emailSent: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar convite' };
  }
}

export async function revokeTeamInvite(inviteId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, membership } = await getAuthContext();
    if (membership.role !== 'admin') {
      return { error: 'Somente administradores podem revogar convites.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('invite_tokens')
      .delete()
      .eq('id', inviteId)
      .eq('organization_id', membership.organization_id)
      .eq('used', false);

    if (error) return { error: error.message };
    revalidatePath('/configuracoes');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao revogar convite' };
  }
}

export async function getInvitePreview(
  token: string,
  userId?: string | null,
): Promise<{
  organizationName: string;
  expired: boolean;
  used: boolean;
  alreadyMember: boolean;
} | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (admin as any)
    .from('invite_tokens')
    .select('organization_id, expires_at, used, organization:organizations(name)')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return null;
  const org = invite.organization as { name?: string } | null;
  const organizationId = invite.organization_id as string;

  let alreadyMember = false;
  if (userId) {
    const { data: existingMember } = await admin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    alreadyMember = !!existingMember;
  }

  return {
    organizationName: org?.name ?? 'Organização',
    expired: new Date(invite.expires_at) <= new Date(),
    used: invite.used,
    alreadyMember,
  };
}

export async function acceptTeamInvite(
  token: string,
): Promise<{ ok: true; organizationName: string; alreadyMember?: boolean } | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Faça login para aceitar o convite.' };

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error: inviteErr } = await (admin as any)
      .from('invite_tokens')
      .select('id, organization_id, expires_at, used, organization:organizations(name)')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr || !invite) return { error: 'Convite inválido ou expirado.' };
    if (invite.used) return { error: 'Este convite já foi utilizado.' };
    if (new Date(invite.expires_at) <= new Date()) {
      return { error: 'Este convite expirou. Peça um novo link ao administrador.' };
    }

    const orgId = invite.organization_id as string;
    const orgName = (invite.organization as { name?: string } | null)?.name ?? 'Organização';

    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id, is_active, accepted_at')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember?.is_active && existingMember.accepted_at) {
      return { ok: true, organizationName: orgName, alreadyMember: true };
    }

    const { data: memberLimit } = await admin.rpc('get_org_member_limit', { p_org_id: orgId });
    const { data: memberCount } = await admin.rpc('org_active_member_count', { p_org_id: orgId });

    if ((memberCount as number) >= (memberLimit as number)) {
      return { error: 'Esta organização atingiu o limite de usuários do plano.' };
    }

    if (existingMember) {
      const { error: updateErr } = await admin
        .from('organization_members')
        .update({
          is_active: true,
          accepted_at: new Date().toISOString(),
          role: 'member',
        })
        .eq('id', existingMember.id);
      if (updateErr) return { error: updateErr.message };
    } else {
      const { error: insertErr } = await admin.from('organization_members').insert({
        organization_id: orgId,
        user_id: user.id,
        role: 'member',
        is_active: true,
        accepted_at: new Date().toISOString(),
      });
      if (insertErr) return { error: insertErr.message };
    }

    // Org pessoal criada no cadastro (1 usuário) — desativa para o convidado usar a equipe
    const { data: otherMemberships } = await admin
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .neq('organization_id', orgId);

    for (const membership of otherMemberships ?? []) {
      const { count } = await admin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', membership.organization_id)
        .eq('is_active', true)
        .not('accepted_at', 'is', null);

      if ((count ?? 0) <= 1) {
        await admin
          .from('organization_members')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', membership.id);
      }
    }

    await admin
      .from('invite_tokens')
      .update({
        used: true,
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    revalidatePath('/configuracoes');
    revalidatePath('/funil');
    return { ok: true, organizationName: orgName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao aceitar convite' };
  }
}
