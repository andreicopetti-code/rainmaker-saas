import { createClient } from '@/lib/supabase/client';
import type { UserProfile } from '@/app/auth/actions';

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

export async function loadUserProfileClient(): Promise<UserProfile | null> {
  const supabase = createClient();

  const sessionResult = await withTimeout(supabase.auth.getSession(), 8000);
  let user = sessionResult?.data.session?.user ?? null;

  if (!user) {
    const userResult = await withTimeout(supabase.auth.getUser(), 8000);
    user = userResult?.data.user ?? null;
  }

  if (!user) return null;

  const profileResult = await withTimeout(
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
    8000,
  );
  const profile = profileResult?.data ?? null;

  const meta = user.user_metadata as { full_name?: string; avatar_url?: string } | undefined;

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? meta?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? meta?.avatar_url ?? null,
  };
}
