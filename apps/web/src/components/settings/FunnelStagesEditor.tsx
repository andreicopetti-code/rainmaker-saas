'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetFunnelStages, saveFunnelStages } from '@/app/configuracoes/actions';
import {
  deriveColColors,
  newStageId,
  paletteForIndex,
  type FunnelStageConfig,
} from '@/lib/funnel/stage-config';

type Props = {
  funnelId: string;
  initialConfig: FunnelStageConfig[];
  initialCounts: Record<string, number>;
};

type ConfirmState = {
  message: string;
  onConfirm: () => void;
  danger?: boolean;
  label?: string;
};

export function FunnelStagesEditor({ funnelId, initialConfig, initialCounts }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [counts, setCounts] = useState(initialCounts);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [newName, setNewName] = useState('');
  const [isPending, startTransition] = useTransition();
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    setConfig(initialConfig);
    setCounts(initialCounts);
  }, [initialConfig, initialCounts]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  function persist(
    next: FunnelStageConfig[],
    opts?: Parameters<typeof saveFunnelStages>[2],
    toastMsg?: string,
  ) {
    setConfig(next);
    startTransition(async () => {
      try {
        await saveFunnelStages(funnelId, next, opts);
        if (opts?.deletedStageId && opts.fallbackStageId) {
          const moved = counts[opts.deletedStageId] ?? 0;
          setCounts((prev) => {
            const copy = { ...prev };
            delete copy[opts.deletedStageId!];
            copy[opts.fallbackStageId!] = (copy[opts.fallbackStageId!] ?? 0) + moved;
            return copy;
          });
        }
        router.refresh();
        if (toastMsg) showToast(toastMsg);
      } catch (err) {
        setConfig(initialConfig);
        alert(err instanceof Error ? err.message : 'Erro ao salvar etapas');
      }
    });
  }

  function handleRename(idx: number, value: string) {
    const name = value.trim();
    if (!name || name === config[idx].label) return;
    const next = config.map((s, i) => (i === idx ? { ...s, label: name } : s));
    persist(next, undefined, undefined);
  }

  function handleColor(idx: number, hex: string) {
    const derived = deriveColColors(hex);
    const next = config.map((s, i) => (i === idx ? { ...s, ...derived } : s));
    setConfig(next);
    startTransition(async () => {
      try {
        await saveFunnelStages(funnelId, next);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao salvar cor');
      }
    });
  }

  function handleToggleVisibility(idx: number) {
    const col = config[idx];
    const next = config.map((s, i) =>
      i === idx ? { ...s, hidden: !s.hidden } : s,
    );
    persist(
      next,
      undefined,
      !col.hidden
        ? `Etapa "${col.label}" ocultada do funil.`
        : `Etapa "${col.label}" exibida no funil.`,
    );
  }

  function handleDelete(idx: number) {
    if (config.length <= 1) return;
    const col = config[idx];
    const count = counts[col.id] ?? 0;
    const fallback = config[idx === 0 ? 1 : 0];

    const message =
      count > 0
        ? `A etapa "${col.label}" tem ${count} card${count > 1 ? 's' : ''}. Eles serão movidos para "${fallback.label}". Confirma a exclusão?`
        : `Deseja excluir a etapa "${col.label}"?`;

    setConfirm({
      message,
      danger: true,
      label: 'Excluir etapa',
      onConfirm: () => {
        setConfirm(null);
        const next = config.filter((_, i) => i !== idx);
        persist(
          next,
          {
            deletedStageId: col.id,
            deletedStageLabel: col.label,
            fallbackStageId: fallback.id,
          },
          `Etapa "${col.label}" excluída.`,
        );
      },
    });
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const palette = paletteForIndex(config.length);
    const id = newStageId();
    const next = [...config, { id, label: name, ...palette, hidden: false }];
    setNewName('');
    setCounts((prev) => ({ ...prev, [id]: 0 }));
    persist(next, undefined, `Etapa "${name}" adicionada!`);
  }

  function handleReset() {
    setConfirm({
      message:
        'Restaurar as etapas padrão? Os nomes customizados serão perdidos, mas os contatos serão mantidos.',
      label: 'Restaurar',
      onConfirm: () => {
        setConfirm(null);
        startTransition(async () => {
          try {
            await resetFunnelStages(funnelId);
            router.refresh();
            showToast('Etapas restauradas ao padrão.');
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Erro ao restaurar etapas');
          }
        });
      },
    });
  }

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    document.querySelectorAll('.col-setting-row').forEach((r) => r.classList.remove('settings-drag-over'));
    document.getElementById(`colrow-${idx}`)?.classList.add('settings-drag-over');
  }

  function handleDragLeave(idx: number) {
    document.getElementById(`colrow-${idx}`)?.classList.remove('settings-drag-over');
  }

  function handleDragEnd() {
    document.querySelectorAll('.col-setting-row').forEach((r) => {
      r.classList.remove('settings-drag-over', 'dragging-settings');
    });
    dragIdx.current = null;
  }

  function handleDrop(idx: number) {
    document.querySelectorAll('.col-setting-row').forEach((r) => r.classList.remove('settings-drag-over'));
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const from = dragIdx.current;
    dragIdx.current = null;
    const next = [...config];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    persist(next);
  }

  return (
    <>
      <div className="settings-left">
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <div className="settings-section-title">Etapas do funil</div>
              <div className="settings-section-desc">
                Renomeie, reordene ou exclua etapas. Arraste ↕ para reordenar.
              </div>
            </div>
          </div>

          <div id="col-settings-list">
            {config.map((col, i) => {
              const count = counts[col.id] ?? 0;
              const canDel = config.length > 1;
              const isHidden = col.hidden === true;

              return (
                <div
                  key={col.id}
                  id={`colrow-${i}`}
                  className={`col-setting-row${isHidden ? ' is-hidden' : ''}`}
                  draggable={!isPending}
                  onDragStart={() => {
                    handleDragStart(i);
                    setTimeout(() => document.getElementById(`colrow-${i}`)?.classList.add('dragging-settings'), 0);
                  }}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => handleDragLeave(i)}
                >
                  <span className="col-drag-handle" title="Arraste para reordenar">⠿</span>
                  <input
                    type="color"
                    className="col-color-picker"
                    value={col.color}
                    onChange={(e) => handleColor(i, e.target.value)}
                    title="Escolher cor da etapa"
                    disabled={isPending}
                  />
                  <div className="col-swatch" style={{ background: col.color }} />
                  <input
                    className="col-setting-input"
                    defaultValue={col.label}
                    maxLength={30}
                    disabled={isPending}
                    onBlur={(e) => handleRename(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <span className="col-count-badge">
                    {count} card{count !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className={`btn-visibility${isHidden ? ' hidden-stage' : ''}`}
                    onClick={() => handleToggleVisibility(i)}
                    title={isHidden ? 'Mostrar etapa no funil' : 'Ocultar etapa no funil'}
                    disabled={isPending}
                  >
                    {isHidden ? '🙈' : '👁'}
                  </button>
                  <button
                    type="button"
                    className="btn-del-col"
                    disabled={!canDel || isPending}
                    onClick={() => handleDelete(i)}
                    title={canDel ? 'Excluir etapa' : 'É necessário ao menos uma etapa'}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="add-col-row">
            <input
              className="add-col-input"
              placeholder="Nome da nova etapa..."
              maxLength={30}
              value={newName}
              disabled={isPending}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button type="button" className="btn-primary" onClick={handleAdd} disabled={isPending || !newName.trim()}>
              + Adicionar etapa
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <div className="settings-section-title">Redefinir configurações</div>
              <div className="settings-section-desc">
                Restaura as etapas padrão do funil. Os contatos e leads não são apagados.
              </div>
            </div>
            <button type="button" className="btn-danger" onClick={handleReset} disabled={isPending}>
              Restaurar padrão
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="settings-toast">{toast}</div>}

      {confirm && (
        <div className="settings-confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="settings-confirm-box" onClick={(e) => e.stopPropagation()}>
            <p>{confirm.message}</p>
            <div className="settings-confirm-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={confirm.danger ? 'btn-danger' : 'btn-primary'}
                onClick={confirm.onConfirm}
              >
                {confirm.label ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
