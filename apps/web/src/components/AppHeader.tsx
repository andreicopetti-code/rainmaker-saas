'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { getUnreadEmailCount } from '@/app/emails/actions';
import type { UserProfile } from '@/app/auth/actions';
import { FunnelHeaderTools } from '@/components/funnel/FunnelHeaderTools';
import { UserMenu } from '@/components/UserMenu';
import { useTheme } from '@/components/ThemeProvider';

export function AppHeader({ initialUserProfile = null }: { initialUserProfile?: UserProfile | null }) {
  const pathname = usePathname();
  const isFunil = pathname.startsWith('/funil');
  const isDashboard = pathname.startsWith('/dashboard');
  const isAgenda = pathname.startsWith('/agenda');
  const isContatos = pathname.startsWith('/contatos');
  const isEmails = pathname.startsWith('/emails');
  const isCeo = pathname.startsWith('/ceo');
  const isEmpresas = pathname.startsWith('/empresas');
  const [unreadEmails, setUnreadEmails] = useState(0);
  const [, startTransition] = useTransition();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    startTransition(async () => {
      const count = await getUnreadEmailCount();
      setUnreadEmails(count);
    });
  }, [pathname]);

  return (
    <header className="header">
      {/* Logo */}
      <Link href="/funil" className="logo">
        <div className="logo-icon">
          <Image src="/logo.png" alt="CEO Brain" width={34} height={34} priority />
        </div>
        <span className="logo-text">CEO <span>Brain</span></span>
      </Link>

      {/* Nav */}
      <nav className="header-nav" role="navigation" aria-label="Navegação principal">
        <Link
          href="/funil"
          className={`btn-nav${isFunil ? ' active' : ''}`}
          aria-label="Funil de vendas"
        >
          {/* funnel icon */}
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <rect x="2" y="3" width="20" height="3" rx="1" />
            <rect x="4" y="8" width="15" height="3" rx="1" />
            <rect x="7" y="13" width="9" height="3" rx="1" />
            <rect x="10" y="18" width="4" height="3" rx="1" />
          </svg>
          <span>Funil</span>
        </Link>

        <Link
          href="/agenda"
          className={`btn-nav${isAgenda ? ' active' : ''}`}
          aria-label="Agenda"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H5V9h14v12zM5 7V5h14v2H5zm2 4h5v5H7z"/>
          </svg>
          <span>Agenda</span>
        </Link>

        <Link
          href="/dashboard"
          className={`btn-nav${isDashboard ? ' active' : ''}`}
          aria-label="Dashboard"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <rect x="2" y="16" width="4" height="6" rx="1" />
            <rect x="8" y="11" width="4" height="11" rx="1" />
            <rect x="14" y="6" width="4" height="16" rx="1" />
            <rect x="20" y="13" width="2" height="9" rx="1" />
          </svg>
          <span>Dashboard</span>
        </Link>

        <Link
          href="/contatos"
          className={`btn-nav${isContatos ? ' active' : ''}`}
          aria-label="Contatos"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
          <span>Contatos</span>
        </Link>

        <Link
          href="/emails"
          className={`btn-nav${isEmails ? ' active' : ''}`}
          aria-label="E-mails"
          style={{ position: 'relative' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
          <span>E-mails</span>
          {unreadEmails > 0 ? (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: 'var(--red)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {unreadEmails > 99 ? '99+' : unreadEmails}
            </span>
          ) : null}
        </Link>

        <Link
          href="/empresas"
          className={`btn-nav${isEmpresas ? ' active' : ''}`}
          aria-label="Consulta CNPJ"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
          </svg>
          <span>Empresas</span>
        </Link>

        <Link
          href="/ceo"
          className={`btn-nav btn-nav-ceo${isCeo ? ' active' : ''}`}
          aria-label="CEO Brain IA"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
            <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" />
          </svg>
          <span>CEO Brain</span>
        </Link>
      </nav>

      <FunnelHeaderTools />

      {/* Actions */}
      <div className={`header-actions${isFunil ? ' header-actions--with-funnel' : ''}`}>
        <button
          type="button"
          className="btn-theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM3.51 4.93l1.41-1.41 2.12 2.12-1.41 1.41L3.51 4.93zM16.96 18.38l1.41-1.41 2.12 2.12-1.41 1.41-2.12-2.12zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM3.51 19.07l2.12-2.12 1.41 1.41-2.12 2.12-1.41-1.41zM16.96 5.62l2.12-2.12 1.41 1.41-2.12 2.12-1.41-1.41z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path d="M21.64 13.64A9 9 0 1 1 10.36 2.36 7 7 0 0 0 21.64 13.64z" />
            </svg>
          )}
        </button>
        <UserMenu initialProfile={initialUserProfile} />
      </div>
    </header>
  );
}
