'use client';

import { useState } from 'react';
import { createCalendarEvent, updateCalendarEvent } from '@/app/agenda/actions';
import {
  buildScheduledAt,
  nextFullHourInAppTz,
  scheduledAtToDate,
  scheduledAtToTime,
  todayInAppTz,
} from '@/lib/appointments/datetime';
import { APPOINTMENT_TIPOS } from '@/components/board/types';
import type { AppointmentTipo } from '@/components/board/types';
import type { CalendarEvent, CalendarEventInput } from '@/app/agenda/actions';

export type CalendarCreateSeed = {
  opportunityId: string;
  tipo?: AppointmentTipo;
  title?: string;
  date?: string;
  headline?: string;
};

type Props = {
  event: CalendarEvent | null;
  defaultDate: string;
  opportunities: { id: string; label: string }[];
  currentUserId?: string;
  createSeed?: CalendarCreateSeed | null;
  onClose: () => void;
  onSaved: (ev: CalendarEvent) => void;
  onDeleted: (id: string) => void;
  onToggleDone: (id: string) => void;
  onOpenDeal?: (dealId: string) => void;
  autoFocusTime?: boolean;
};

export function CalendarEventModal({
  event,
  defaultDate,
  opportunities,
  currentUserId,
  createSeed,
  onClose,
  onSaved,
  onDeleted,
  onToggleDone,
  onOpenDeal,
  autoFocusTime,
}: Props) {
  const isEdit = !!event;
  const isNext = !isEdit && !!createSeed;

  const initDate = event
    ? scheduledAtToDate(event.scheduled_at)
    : (createSeed?.date || defaultDate || todayInAppTz());
  const initTime = event ? scheduledAtToTime(event.scheduled_at) : nextFullHourInAppTz();

  const [tipo, setTipo] = useState<AppointmentTipo>(
    event?.tipo ?? createSeed?.tipo ?? 'followup',
  );
  const [title, setTitle] = useState(event?.title ?? createSeed?.title ?? '');
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);
  const [location, setLocation] = useState(event?.location ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [oppId, setOppId] = useState<string>(
    event?.opportunity_id ?? createSeed?.opportunityId ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: CalendarEventInput = {
        tipo,
        title: title.trim() || (APPOINTMENT_TIPOS.find(t => t.id === tipo)?.label ?? tipo),
        scheduled_at: buildScheduledAt(date, time),
        location: location.trim() || undefined,
        note: note.trim() || undefined,
        opportunity_id: oppId || null,
      };

      if (isEdit && event) {
        await updateCalendarEvent(event.id, input);
        const oppLabel = opportunities.find(o => o.id === (oppId || ''))?.label ?? null;
        onSaved({
          ...event,
          tipo: input.tipo,
          title: input.title,
          scheduled_at: input.scheduled_at,
          location: input.location ?? null,
          note: input.note ?? null,
          opportunity_id: input.opportunity_id ?? null,
          is_standalone: !input.opportunity_id,
          contact_company: oppLabel,
          contact_name: null,
          opportunity_title: oppLabel,
          contact_phone: event.contact_phone,
        });
      } else {
        await createCalendarEvent(input);
        // Reload from server via router.refresh called in CalendarView.handleSaved
        const oppLabel = opportunities.find(o => o.id === (oppId || ''))?.label ?? null;
        onSaved({
          id: crypto.randomUUID(),
          tipo: input.tipo,
          title: input.title,
          scheduled_at: input.scheduled_at,
          done: false,
          note: input.note ?? null,
          location: input.location ?? null,
          is_standalone: !input.opportunity_id,
          opportunity_id: input.opportunity_id ?? null,
          opportunity_title: oppLabel,
          opportunity_stage: null,
          contact_company: oppLabel,
          contact_name: null,
          contact_phone: null,
          created_by: currentUserId ?? '',
          assignee_id: currentUserId ?? '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const currentTipo = APPOINTMENT_TIPOS.find((t) => t.id === tipo);
  const modalTitle = isEdit
    ? 'Editar Compromisso'
    : isNext
      ? (createSeed?.headline ?? 'Próximo compromisso')
      : 'Novo Compromisso';
  const linkedName =
    (isEdit && event
      ? event.contact_company || event.contact_name || event.opportunity_title
      : opportunities.find((o) => o.id === oppId)?.label) || null;

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">{modalTitle}</div>
            {linkedName && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                Para: <strong style={{ color: 'var(--text2)' }}>{linkedName}</strong>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEdit && event?.opportunity_id && onOpenDeal && (
              <button
                type="button"
                onClick={() => onOpenDeal(event.opportunity_id!)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--blue)',
                  background: 'var(--blue-bg)',
                  color: 'var(--blue)',
                  cursor: 'pointer',
                }}
              >
                Abrir negócio →
              </button>
            )}
            {isEdit && (
              <button
                type="button"
                onClick={() => onToggleDone(event!.id)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 6, border: '1px solid',
                  background: event!.done ? 'var(--green-bg)' : 'var(--surface2)',
                  color: event!.done ? 'var(--green)' : 'var(--text2)',
                  borderColor: event!.done ? 'var(--green)' : 'var(--border)',
                  cursor: 'pointer',
                }}
              >
                {event!.done ? '✓ Feito' : 'Marcar feito'}
              </button>
            )}
            <button type="button" className="btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* Tipo */}
            <div className="form-group">
              <label className="form-label">Tipo de compromisso *</label>
              <select className="form-input form-select" value={tipo} onChange={e => setTipo(e.target.value as AppointmentTipo)}>
                {APPOINTMENT_TIPOS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Título */}
            <div className="form-group">
              <label className="form-label">Título / Descrição</label>
              <input
                className="form-input"
                placeholder={`Ex: ${currentTipo?.label ?? 'Compromisso'} de apresentação`}
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            {/* Data + Hora */}
            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Data *</label>
                <input required type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Horário *</label>
                <input required type="time" className="form-input" value={time} onChange={e => setTime(e.target.value)} autoFocus={autoFocusTime} />
              </div>
            </div>

            {/* Vincular a deal */}
            <div className="form-group">
              <label className="form-label">Vincular a deal do funil</label>
              <select
                className="form-input form-select"
                value={oppId}
                onChange={e => setOppId(e.target.value)}
                disabled={isNext && !!createSeed?.opportunityId}
              >
                <option value="">— Evento independente —</option>
                {opportunities.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Local / Link */}
            <div className="form-group">
              <label className="form-label">Local / Link</label>
              <input
                className="form-input"
                placeholder="Escritório, Google Meet, Zoom…"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            {/* Observações */}
            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea
                rows={3}
                className="form-input form-textarea"
                placeholder="Contexto, pauta, preparação necessária…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            {isEdit ? (
              <button
                type="button"
                className="btn-ghost"
                style={{ color: 'var(--red)', borderColor: 'var(--red)33' }}
                onClick={() => {
                  if (confirm('Excluir este compromisso?')) onDeleted(event!.id);
                }}
              >
                Excluir
              </button>
            ) : <span />}
            <div className="modal-footer-right">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : isNext ? 'Agendar próximo' : 'Criar compromisso'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
