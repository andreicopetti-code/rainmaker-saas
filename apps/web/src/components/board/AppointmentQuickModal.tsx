'use client';

import { useState } from 'react';
import {
  createAppointment,
  updateAppointment,
  deleteAppointment,
  toggleAppointmentDone,
} from '@/app/funil/appointmentActions';
import {
  buildScheduledAt,
  nextFullHourInAppTz,
  scheduledAtToDate,
  scheduledAtToTime,
  suggestNextApptDateKey,
  todayInAppTz,
} from '@/lib/appointments/datetime';
import { APPOINTMENT_TIPOS } from './types';
import type { AppointmentTipo, NextAppointment } from './types';

export type AppointmentQuickSeed = {
  tipo?: AppointmentTipo;
  date?: string;
  headline?: string;
};

export type AppointmentQuickSavedMeta = {
  scheduleNext?: boolean;
  activityAt?: string | null;
};

type Props = {
  opportunityId: string;
  opportunityName: string;
  /** If provided, the modal is in edit mode */
  existing?: NextAppointment;
  /** Prefill for create mode (e.g. next follow-up after Cumprido) */
  seed?: AppointmentQuickSeed | null;
  onClose: () => void;
  /** Called with the updated/created/next appointment so the card can update immediately */
  onSaved: (appt: NextAppointment | null, meta?: AppointmentQuickSavedMeta) => void;
};

export function AppointmentQuickModal({
  opportunityId,
  opportunityName,
  existing,
  seed,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!existing;
  const isNext = !isEdit && !!seed;

  const [tipo, setTipo] = useState<AppointmentTipo>(
    existing?.tipo ?? seed?.tipo ?? 'ligacao',
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(
    existing
      ? scheduledAtToDate(existing.scheduled_at)
      : (seed?.date ?? todayInAppTz()),
  );
  const [time, setTime] = useState(
    existing ? scheduledAtToTime(existing.scheduled_at) : nextFullHourInAppTz(),
  );
  const [location, setLocation] = useState(existing?.location ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || deleting || markingDone;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        tipo,
        title: title.trim() || (APPOINTMENT_TIPOS.find(t => t.id === tipo)?.label ?? tipo),
        scheduled_at: buildScheduledAt(date, time),
        location: location.trim() || undefined,
        note: note.trim() || undefined,
      };
      if (isEdit && existing) {
        const saved = await updateAppointment(existing.id, payload);
        onSaved(saved);
      } else {
        const created = await createAppointment(opportunityId, payload);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkDone(scheduleNext: boolean) {
    if (!existing || existing.done) return;
    setMarkingDone(true);
    setError(null);
    try {
      const result = await toggleAppointmentDone(existing.id, true);
      onSaved(result.next, {
        scheduleNext,
        activityAt: result.activityAt,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao marcar como cumprido');
    } finally {
      setMarkingDone(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm('Excluir este compromisso?')) return;
    setDeleting(true);
    try {
      await deleteAppointment(existing.id);
      onSaved(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  const currentTipo = APPOINTMENT_TIPOS.find((t) => t.id === tipo);
  const modalTitle = isEdit
    ? 'Editar Compromisso'
    : (seed?.headline ?? (isNext ? 'Próximo compromisso' : 'Agendar Compromisso'));

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{modalTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Para: <strong style={{ color: 'var(--text2)' }}>{opportunityName}</strong>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Tipo de compromisso *</label>
              <select className="form-input form-select" value={tipo} onChange={(e) => setTipo(e.target.value as AppointmentTipo)}>
                {APPOINTMENT_TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Título / Descrição</label>
              <input
                className="form-input"
                placeholder={`Ex: ${currentTipo?.label ?? 'Compromisso'} com ${opportunityName}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Data *</label>
                <input required type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Horário *</label>
                <input required type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Local / Link</label>
              <input className="form-input" placeholder="Escritório, Google Meet, Zoom…" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea rows={3} className="form-input form-textarea" placeholder="Contexto, pauta, preparação necessária…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
            {isEdit ? (
              <button type="button" className="btn-ghost" style={{ color: 'var(--red)', borderColor: 'var(--red)33' }} onClick={handleDelete} disabled={busy}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            ) : <span />}
            <div className="modal-footer-right" style={{ flexWrap: 'wrap' }}>
              {isEdit && !existing?.done ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ color: 'var(--green)', borderColor: 'var(--green)55' }}
                    onClick={() => handleMarkDone(false)}
                    disabled={busy}
                  >
                    {markingDone ? '…' : '✓ Cumprido'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ color: 'var(--blue-dark)', borderColor: 'var(--blue)55' }}
                    onClick={() => handleMarkDone(true)}
                    disabled={busy}
                    title={`Sugere ${suggestNextApptDateKey()} · follow-up`}
                  >
                    Cumprido e próximo
                  </button>
                </>
              ) : null}
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : isNext ? 'Agendar próximo' : 'Agendar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
