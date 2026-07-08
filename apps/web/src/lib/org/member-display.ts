import type { OrgMember } from '@/components/board/types';

export function memberDisplayName(
  m: Pick<OrgMember, 'user_id' | 'full_name' | 'email'>,
): string {
  const name = m.full_name?.trim();
  if (name) return name;
  const email = m.email?.trim();
  if (email) return email;
  return 'Usuário';
}
