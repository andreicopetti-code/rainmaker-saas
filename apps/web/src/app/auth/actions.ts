'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type UserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function avatarExtension(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const meta = user.user_metadata as { full_name?: string; avatar_url?: string } | undefined;

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? meta?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? meta?.avatar_url ?? null,
  };
}

export async function uploadUserAvatar(
  formData: FormData,
): Promise<{ avatarUrl: string } | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione uma imagem válida.' };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: 'Use JPG, PNG ou WebP (até 2 MB).' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: 'A imagem deve ter no máximo 2 MB.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado.' };

  const ext = avatarExtension(file.type);
  const path = `${user.id}/avatar.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (uploadError) return { error: uploadError.message };

  const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (profileError) return { error: profileError.message };

  revalidatePath('/', 'layout');
  return { avatarUrl };
}

export async function removeUserAvatar(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado.' };

  const { data: objects } = await supabase.storage.from(AVATAR_BUCKET).list(user.id);
  if (objects?.length) {
    const paths = objects.map((o) => `${user.id}/${o.name}`);
    await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (profileError) return { error: profileError.message };

  revalidatePath('/', 'layout');
  return { ok: true };
}
