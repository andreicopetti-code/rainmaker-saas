export function isOrgAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

/** Membros só podem ser donos dos próprios negócios; admin pode atribuir a qualquer um. */
export function resolveDealOwnerId(
  role: string,
  userId: string,
  requestedOwnerId: string | undefined,
  existingOwnerId?: string,
): string {
  if (isOrgAdmin(role)) {
    return requestedOwnerId || existingOwnerId || userId;
  }
  return userId;
}

export async function assertCanModifyOpportunity(
  supabase: { from: (table: string) => unknown },
  opportunityId: string,
  orgId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (isOrgAdmin(role)) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('opportunities')
    .select('owner_id')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) throw new Error('Negócio não encontrado');
  if (data.owner_id !== userId) {
    throw new Error('Sem permissão para alterar este negócio');
  }
}
