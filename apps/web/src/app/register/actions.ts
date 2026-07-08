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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    return { error: mapRegisterError(error.message) };
  }

  if (data.session) {
    redirect(redirectTo.startsWith('/') ? redirectTo : '/funil');
  }

  return { success: true, needsEmailConfirmation: true };
}
