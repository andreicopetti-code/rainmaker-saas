'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthBrandMark } from '@/components/auth/AuthBrandMark';

function normalizeAuthMessage(message: unknown, status?: number): string {
  const text = String(message ?? '').trim();
  if (!text || text === '{}') {
    if (status === 500 || status === 503) {
      return 'O sistema está temporariamente indisponível. Tente novamente em alguns minutos.';
    }
    return 'Não foi possível conectar ao servidor. Verifique sua internet.';
  }
  return text;
}

function mapResetError(message: unknown, status?: number): string {
  const m = normalizeAuthMessage(message, status).toLowerCase();
  if (m.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  if (
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('database error') ||
    m.includes('temporariamente indisponível')
  ) {
    return 'O sistema está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  return normalizeAuthMessage(message, status);
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      setError(mapResetError(resetError.message, resetError.status));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <AuthBrandMark />
          <p className="mt-4 text-sm text-slate-500">Recuperar senha</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Se existir uma conta com <strong>{email}</strong>, enviamos um link para redefinir a senha.
              Verifique sua caixa de entrada (e spam).
            </div>
            <Link
              href="/login"
              className="block text-center text-sm font-semibold text-blue-600 hover:underline"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <p className="text-sm text-slate-600">
              Informe seu e-mail e enviaremos um link para criar uma nova senha.
            </p>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="seu@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>
          </form>
        )}

        {!sent && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Lembrou a senha?{' '}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              Entrar
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
