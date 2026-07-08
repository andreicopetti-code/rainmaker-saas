'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ALL_BRAZILIAN_UFS } from '@/lib/billing/org-uf-access';
import { saveOrganizationAllowedUfs } from '@/app/configuracoes/actions';
import type { OrganizationUfSettings } from '@/app/configuracoes/actions';

type Props = {
  settings: OrganizationUfSettings;
  compact?: boolean;
  onSaved?: () => void;
};

export function OrganizationUfSelector({ settings, compact = false, onSaved }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(settings.selectedUfs);
  const [savedUfs, setSavedUfs] = useState<string[]>(settings.selectedUfs);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (settings.isNational) {
    return (
      <div className={`org-uf-panel${compact ? ' org-uf-panel--compact' : ''}`}>
        <div className="org-uf-head">
          <span className="org-uf-title">Estados incluídos</span>
          <span className="org-uf-badge org-uf-badge--ok">Brasil + DF</span>
        </div>
        <p className="org-uf-hint">Plano {settings.planName}: fichas completas em todas as UFs.</p>
      </div>
    );
  }

  if (settings.isPreviewOnly) {
    return (
      <div className={`org-uf-panel${compact ? ' org-uf-panel--compact' : ''}`}>
        <div className="org-uf-head">
          <span className="org-uf-title">Base Empresas</span>
          <span className="org-uf-badge">Preview</span>
        </div>
        <p className="org-uf-hint">
          Plano Free: preview de qualquer CNPJ · até 3 fichas completas/mês (qualquer UF).
          {' '}
          <Link href="/billing">Fazer upgrade</Link>
        </p>
      </div>
    );
  }

  const lockedUfs = settings.ufsLocked ? savedUfs : [];
  const hasPendingChanges =
    selected.length !== savedUfs.length || selected.some((uf) => !savedUfs.includes(uf));

  function toggle(uf: string) {
    if (!settings.isAdmin) return;
    setSaved(false);
    setError(null);

    if (lockedUfs.includes(uf)) return;

    setSelected((prev) => {
      if (prev.includes(uf)) return prev.filter((u) => u !== uf);
      if (settings.ufsLocked) {
        if (prev.length >= settings.ufLimit) return prev;
        return [...prev, uf].sort();
      }
      if (settings.ufLimit === 1) return [uf];
      if (prev.length >= settings.ufLimit) return prev;
      return [...prev, uf].sort();
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveOrganizationAllowedUfs(selected);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setSavedUfs([...selected]);
      setSaved(true);
      onSaved?.();
      router.refresh();
    });
  }

  const limitLabel = settings.ufLimit === 1
    ? '1 UF'
    : `até ${settings.ufLimit} UFs`;

  return (
    <div className={`org-uf-panel${compact ? ' org-uf-panel--compact' : ''}`}>
      <div className="org-uf-head">
        <span className="org-uf-title">Estados do plano</span>
        <span className={`org-uf-badge${settings.needsSelection ? ' org-uf-badge--warn' : ' org-uf-badge--ok'}`}>
          {settings.planName} · {limitLabel}
        </span>
      </div>

      {settings.needsSelection && (
        <p className="org-uf-alert">
          Escolha {limitLabel} para desbloquear fichas completas na Base Empresas. Após salvar, a(s) UF(s) ficam fixas.
        </p>
      )}

      {settings.ufsLocked && (
        <p className="org-uf-hint">
          UFs contratadas são permanentes neste plano. Para incluir outro estado sem trocar, contrate{' '}
          <Link href="/billing">+1 UF</Link> em Plano e assinatura.
        </p>
      )}

      {!settings.ufsLocked && (
        <p className="org-uf-hint">
          Fichas completas só consumem crédito em empresas das UFs selecionadas.
          Preview básico continua disponível para qualquer CNPJ.
        </p>
      )}

      <div className="org-uf-grid">
        {ALL_BRAZILIAN_UFS.map((uf) => {
          const active = selected.includes(uf);
          const isLockedChip = lockedUfs.includes(uf);
          const disabled =
            !settings.isAdmin ||
            isLockedChip ||
            (!active && selected.length >= settings.ufLimit);
          return (
            <button
              key={uf}
              type="button"
              className={`org-uf-chip${active ? ' active' : ''}${isLockedChip ? ' locked' : ''}`}
              disabled={disabled || isPending}
              title={isLockedChip ? 'UF contratada (não pode ser removida)' : undefined}
              onClick={() => toggle(uf)}
            >
              {uf}
            </button>
          );
        })}
      </div>

      {savedUfs.length > 0 && !settings.needsSelection && (
        <p className="org-uf-current">
          Ativas: <strong>{savedUfs.join(', ')}</strong>
          {settings.ufsLocked ? ' (fixas)' : ''}
        </p>
      )}

      {error && <p className="org-uf-error">{error}</p>}
      {saved && <p className="org-uf-success">UFs salvas com sucesso.</p>}

      {settings.isAdmin ? (
        <div className="org-uf-actions">
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: 12 }}
            disabled={isPending || selected.length === 0 || (!settings.needsSelection && !hasPendingChanges)}
            onClick={handleSave}
          >
            {isPending ? 'Salvando…' : settings.ufsLocked ? 'Incluir UF' : 'Salvar UFs'}
          </button>
          <span className="org-uf-count">{selected.length}/{settings.ufLimit} selecionada(s)</span>
        </div>
      ) : (
        <p className="org-uf-hint">Somente administradores podem alterar as UFs.</p>
      )}
    </div>
  );
}
