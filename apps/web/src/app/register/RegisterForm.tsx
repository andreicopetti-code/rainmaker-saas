'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAccount, type RegisterState } from './actions';

type Props = {
  inviteOrganizationName?: string | null;
  redirect?: string;
};

const initialState: RegisterState = {};

export function RegisterForm({
  inviteOrganizationName = null,
  redirect = '/funil',
}: Props) {
  const [state, formAction, pending] = useActionState(registerAccount, initialState);

  const loginHref = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login';

  if (state.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold">
              CEO Brain <span className="text-blue-600">SaaS</span>
            </h1>
            <p className="mt-2 text-sm text-slate-500">Conta criada</p>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {state.needsEmailConfirmation ? (
              <>
                Enviamos um link de confirmação para seu e-mail (se necessário). Depois,{' '}
                <Link href={loginHref} className="font-semibold underline">
                  faça login
                </Link>
                {inviteOrganizationName
                  ? ` para aceitar o convite da equipe ${inviteOrganizationName}.`
                  : ' para começar seu trial de 14 dias.'}
              </>
            ) : (
              <>
                Sua conta foi criada.{' '}
                <Link href={loginHref} className="font-semibold underline">
                  Faça login
                </Link>{' '}
                para continuar.
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">
            CEO Brain <span className="text-blue-600">SaaS</span>
          </h1>
          {inviteOrganizationName ? (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Convite para a equipe <strong>{inviteOrganizationName}</strong>
              </p>
              <p className="mt-1 text-sm text-slate-500">Crie sua conta para aceitar</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Crie sua conta — trial 14 dias</p>
          )}
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirect" value={redirect} />

          {state.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-700">
              Nome completo
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending
              ? 'Criando…'
              : inviteOrganizationName
                ? 'Criar conta e aceitar convite'
                : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Já tem conta?{' '}
          <Link href={loginHref} className="font-semibold text-blue-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
