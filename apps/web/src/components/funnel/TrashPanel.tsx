'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  emptyOpportunityTrash,
  listTrashedOpportunities,
  permanentlyDeleteOpportunity,
  restoreOpportunity,
  type TrashedOpportunity,
} from '@/app/funil/actions';
import { stageLabel } from '@/lib/funnel/stage-config';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';

const RETENTION_DAYS = 30;

type Props = {
  open: boolean;
  funnelId: string;
  stageConfig: FunnelStageConfig[];
  userRole: string;
  currentUserId: string;
  onClose: () => void;
  onCountChange?: (count: number) => void;
};

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const expires = deleted + RETENTION_DAYS * 86400000;
  return Math.max(0, Math.ceil((expires - Date.now()) / 86400000));
}

export function TrashPanel({
  open,
  funnelId,
  stageConfig,
  userRole,
  currentUserId,
  onClose,
  onCountChange,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TrashedOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTrashedOpportunities(funnelId);
      setItems(rows);
      onCountChange?.(rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar lixeira');
    } finally {
      setLoading(false);
    }
  }, [funnelId, onCountChange]);

  useEffect(() => {
    if (open) {
      setConfirmEmpty(false);
      setPendingId(null);
      void load();
    }
  }, [open, load]);

  if (!open) return null;

  function canManage(item: TrashedOpportunity): boolean {
    return userRole === 'admin' || item.owner_id === currentUserId;
  }

  async function handleRestore(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await restoreOpportunity(id);
      await load();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao restaurar');
    } finally {
      setPendingId(null);
    }
  }

  async function handlePermanentDelete(id: string, name: string) {
    if (!window.confirm(`Apagar "${name}" definitivamente?\nEsta ação não pode ser desfeita.`)) return;
    setPendingId(id);
    setError(null);
    try {
      await permanentlyDeleteOpportunity(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao apagar');
    } finally {
      setPendingId(null);
    }
  }

  async function handleEmptyTrash() {
    if (!confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await emptyOpportunityTrash(funnelId);
      await load();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao esvaziar lixeira');
    } finally {
      setLoading(false);
      setConfirmEmpty(false);
    }
  }

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal trash-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Lixeira</div>
        </div>

        <div className="modal-body trash-panel-body">
          <p className="trash-panel-info">
            {items.length > 0
              ? `${items.length} item${items.length > 1 ? 's' : ''} na lixeira. Recuperáveis por ${RETENTION_DAYS} dias.`
              : `Deals excluídos ficam aqui por ${RETENTION_DAYS} dias antes de serem removidos automaticamente.`}
          </p>

          {error && <div className="trash-panel-error">{error}</div>}

          {loading && items.length === 0 ? (
            <div className="trash-panel-empty">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="trash-panel-empty">
              <span className="trash-panel-empty-icon">🗑️</span>
              <p>Lixeira vazia.</p>
            </div>
          ) : (
            <div className="trash-item-list">
              {items.map((item) => {
                const name = item.contact_company?.trim() || item.title;
                const daysLeft = daysRemaining(item.deleted_at);
                const manageable = canManage(item);
                const busy = pendingId === item.id;

                return (
                  <div key={item.id} className="trash-item">
                    <div className="trash-item-icon">🗑️</div>
                    <div className="trash-item-info">
                      <div className="trash-item-name">{name}</div>
                      <div className="trash-item-meta">
                        <span>{stageLabel(stageConfig, item.stage)}</span>
                        {item.owner_name ? <span>· {item.owner_name}</span> : null}
                        <span
                          className={`trash-days-badge ${daysLeft <= 5 ? 'expiring' : 'ok'}`}
                        >
                          {daysLeft}d restantes
                        </span>
                      </div>
                    </div>
                    {manageable && (
                      <div className="trash-item-actions">
                        <button
                          type="button"
                          className="btn-restore"
                          disabled={busy}
                          onClick={() => void handleRestore(item.id)}
                        >
                          ↩ Restaurar
                        </button>
                        <button
                          type="button"
                          className="btn-perm-delete"
                          disabled={busy}
                          title="Apagar definitivamente"
                          onClick={() => void handlePermanentDelete(item.id, name)}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="modal-footer">
            <div className="modal-footer-right">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Fechar
              </button>
              <button
                type="button"
                className={`btn-danger ${confirmEmpty ? 'confirm' : ''}`}
                disabled={loading}
                onClick={() => void handleEmptyTrash()}
              >
                {confirmEmpty ? 'Confirmar esvaziar tudo' : 'Esvaziar lixeira'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
