'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import {
  removeUserAvatar,
  uploadUserAvatar,
  type UserProfile,
} from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/client';
import { loadUserProfileClient } from '@/lib/auth/client-profile';
import { getInitials } from '@/lib/contacts/utils';

function profileDisplayName(profile: UserProfile): string {
  const name = profile.fullName?.trim();
  if (name) return name;
  const local = profile.email.split('@')[0]?.trim();
  return local || 'Usuário';
}

function AvatarContent({
  profile,
  initials,
}: {
  profile: UserProfile | null;
  initials: string;
}) {
  if (profile?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.avatarUrl} alt="" className="user-menu-avatar-img" />
    );
  }
  return (
    <span className="user-menu-avatar-initials" aria-hidden="true">
      {initials}
    </span>
  );
}

type Props = {
  initialProfile?: UserProfile | null;
};

export function UserMenu({ initialProfile = null }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [profileLoaded, setProfileLoaded] = useState(!!initialProfile);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const isSettings = pathname.startsWith('/configuracoes');
  const isBilling = pathname.startsWith('/billing');

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
      setProfileLoaded(true);
    }

    let active = true;

    void loadUserProfileClient()
      .then((data) => {
        if (!active) return;
        setProfile(data ?? initialProfile);
        setProfileLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setProfile(initialProfile);
        setProfileLoaded(true);
      });

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUserProfileClient().then((data) => {
        if (active) setProfile(data);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, initialProfile]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayName = profile ? profileDisplayName(profile) : '';
  const initials = profile
    ? getInitials(displayName)
    : profileLoaded
      ? '?'
      : '…';

  function openFilePicker() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadUserAvatar(formData);
    setUploading(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatarUrl: result.avatarUrl } : prev));
  }

  async function handleRemoveAvatar() {
    setUploading(true);
    setError(null);
    const result = await removeUserAvatar();
    setUploading(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
  }

  return (
    <div className="user-menu" ref={wrapRef}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="user-menu-file-input"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      <button
        type="button"
        className="user-menu-trigger"
        aria-label="Menu do usuário"
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName || 'Conta'}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarContent profile={profile} initials={initials} />
      </button>

      {open ? (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-header">
            <button
              type="button"
              className="user-menu-header-avatar user-menu-avatar-btn"
              aria-label="Alterar foto de perfil"
              disabled={uploading}
              onClick={openFilePicker}
            >
              <AvatarContent profile={profile} initials={initials} />
              <span className="user-menu-avatar-overlay" aria-hidden="true">
                {uploading ? (
                  <span className="user-menu-avatar-spinner" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                    <path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
                  </svg>
                )}
              </span>
            </button>
            <div className="user-menu-header-text">
              <span className="user-menu-name">{displayName || (profileLoaded ? 'Conta' : 'Carregando…')}</span>
              {profile?.email ? (
                <span className="user-menu-email" title={profile.email}>
                  {profile.email}
                </span>
              ) : null}
              <button
                type="button"
                className="user-menu-photo-link"
                disabled={uploading}
                onClick={openFilePicker}
              >
                {uploading ? 'Enviando…' : profile?.avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              </button>
            </div>
          </div>

          {error ? <p className="user-menu-error">{error}</p> : null}

          <div className="user-menu-divider" role="separator" />

          <Link
            href="/configuracoes"
            className={`user-menu-item${isSettings ? ' active' : ''}`}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.47.47 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
            </svg>
            Configurações
          </Link>

          <Link
            href="/billing"
            className={`user-menu-item${isBilling ? ' active' : ''}`}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
              <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4V10h16v8zm0-10H4V6h16v2z" />
            </svg>
            Plano e assinatura
          </Link>

          {profile?.avatarUrl ? (
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              disabled={uploading}
              onClick={handleRemoveAvatar}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              Remover foto
            </button>
          ) : null}

          <div className="user-menu-divider" role="separator" />

          <form action="/auth/signout" method="post">
            <button type="submit" className="user-menu-item danger" role="menuitem">
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
              </svg>
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
