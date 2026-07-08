import type { SupabaseClient } from '@supabase/supabase-js';

type BillingAccessRpc = {
  has_access: boolean;
  block_reason: string | null;
};

export async function getBillingAccessForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ hasAccess: boolean; blockReason: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_billing_access', {
    p_user_id: userId,
  });

  if (error || !data) {
    console.error('[billing] get_billing_access RPC failed:', error?.message);
    return { hasAccess: true, blockReason: null };
  }

  const row = data as BillingAccessRpc;
  return {
    hasAccess: !!row.has_access,
    blockReason: row.block_reason,
  };
}
