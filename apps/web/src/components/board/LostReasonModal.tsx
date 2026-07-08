'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  dealName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

const QUICK_REASONS = ['Preço', 'Prazo', 'Concorrente', 'Sem budget', 'Sem resposta', 'Projeto cancelado'];

export function LostReasonModal({ open, dealName, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <div className="overlay open" onClick={onCancel}>
      <div className="modal lost-reason-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Motivo da perda</div>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="lost-reason-sub">
              <strong>{dealName}</strong> será movido para Perdido. Registre o motivo para melhorar o forecast.
            </p>
            <input
              className="form-input"
              placeholder="Ex: Perdeu para concorrente no preço"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <div className="lost-reason-quick">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="lost-reason-quick-btn"
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <div className="modal-footer-right">
              <button type="button" className="btn-ghost" onClick={onCancel}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={!reason.trim()}>
                Confirmar perda
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
