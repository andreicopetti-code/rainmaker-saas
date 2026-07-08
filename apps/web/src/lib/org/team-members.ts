import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { OrgMember } from '@/components/board/types';
import { memberDisplayName } from '@/lib/org/member-display';

export { memberDisplayName };

/** Membros ativos da org com nome (perfil) ou e-mail como fallback. */
export async function loadOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .not('accepted_at', 'is', null);

  const userIds = (memberRows ?? []).map((m) => m.user_id);
  if (!userIds.length) return [];

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const members: OrgMember[] = [];
  for (const uid of userIds) {
    let email: string | null = null;
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(uid);
      email = authUser.user?.email ?? null;
    } catch {
      email = null;
    }
    members.push({
      user_id: uid,
      full_name: nameByUser.get(uid) ?? null,
      email,
    });
  }

  return members;
}
