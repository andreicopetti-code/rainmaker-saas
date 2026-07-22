'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { APP_NAME } from '@/lib/brand';

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Se ainda não criou conta, use "Criar conta" abaixo.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada).';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.';
  }
  return message;
}

type Props = {
  inviteOrganizationName?: string | null;
};

export function LoginForm({ inviteOrganizationName = null }: Props) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/funil';
  const registerHref = redirect
    ? `/register?redirect=${encodeURIComponent(redirect)}`
    : '/register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
      }

      window.location.assign(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">
            {APP_NAME}
          </h1>
          {inviteOrganizationName ? (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Convite para a equipe <strong>{inviteOrganizationName}</strong>
              </p>
              <p className="mt-1 text-sm text-slate-500">Entre com sua conta para aceitar</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Entre na sua conta</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

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

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Senha
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Entrando…' : inviteOrganizationName ? 'Entrar e aceitar convite' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Não tem conta?{' '}
          <Link href={registerHref} className="font-semibold text-blue-600 hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
