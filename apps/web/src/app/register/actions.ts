'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type RegisterState = {
  error?: string;
  success?: boolean;
  needsEmailConfirmation?: boolean;
};

function mapRegisterError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('user already registered')) {
    return 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
  }
  if (m.includes('password')) {
    return 'Senha inválida. Use no mínimo 6 caracteres.';
  }
  if (m.includes('valid email')) {
    return 'Informe um e-mail válido.';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.';
  }
  return message;
}

export async function registerAccount(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = String(formData.get('redirect') ?? '/funil');

  if (!fullName || !email || !password) {
    return { error: 'Preencha todos os campos.' };
  }
  if (password.length < 6) {
    return { error: 'A senha deve ter no mínimo 6 caracteres.' };
  }

  const supabase = await createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://www.rainmaker.ia.br';
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/funil';
  const emailRedirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(safeRedirect)}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo,
    },
  });

  if (error) {
    const msg = String(error.message ?? '').trim();
    if (!msg || msg === '{}' || error.status === 500 || error.status === 503) {
      return { error: 'O sistema está temporariamente indisponível. Tente novamente em alguns minutos.' };
    }
    return { error: mapRegisterError(error.message) };
  }

  if (data.session) {
    redirect(safeRedirect);
  }

  return { success: true, needsEmailConfirmation: true };
}
