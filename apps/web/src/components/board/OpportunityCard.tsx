'use client';

import { TIERS } from '@ceo-brain/shared';
import { formatBRL } from '@/lib/funnel/stages';
import { formatApptCardDate } from '@/lib/appointments/datetime';
import { getApptDisplay, apptTipoStyle } from '@/lib/appointments/display';
import type { OpportunityItem } from './types';
import { APPOINTMENT_TIPOS } from './types';
import { AppointmentTipoIcon } from './AppointmentTipoIcon';

type Props = {
  opportunity: OpportunityItem;
  isWon: boolean;
  isDragging?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onSchedule: (existing?: import('./types').NextAppointment) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
};

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

export function OpportunityCard({
  opportunity,
  isWon,
  isDragging,
  onClick,
  onDelete,
  onSchedule,
  onDragStart,
  onDragEnd,
  onDragOver,
}: Props) {
  const tier = opportunity.custom_fields?.tier;
  const tierInfo = tier ? TIERS.find((t) => t.id === tier) : null;
  const hasValue = (opportunity.value ?? 0) > 0;
  const leftColor = isWon ? '#16A34A' : tierInfo?.color ?? (hasValue ? '#2563EB' : '#E2E8F0');

  const displayName = opportunity.contact?.company || opportunity.contact?.name || opportunity.title;
  const contactPerson = opportunity.contact?.custom_fields?.contact_person;

  const days = daysAgo(opportunity.updated_at);
  const daysColor = isWon || days === 0 ? 'var(--text3)'
    : days <= 7 ? 'var(--text3)'
    : days <= 14 ? 'var(--amber)'
    : days <= 21 ? '#C44E1C'
    : 'var(--red)';
  const daysLabel = days === 0 ? 'hoje' : days === 1 ? '1d' : `${days}d`;

  const next = opportunity.next_appointment;
  const nextTipo = next ? APPOINTMENT_TIPOS.find((t) => t.id === next.tipo) : null;
  const apptDisplay = next ? getApptDisplay(next.tipo, next.scheduled_at) : null;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Mover "${displayName}" para a lixeira?`)) onDelete();
  }

  function handleSchedule(e: React.MouseEvent, existing?: typeof next) {
    e.stopPropagation();
    onSchedule(existing ?? undefined);
  }

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onClick}
      className="card"
      style={{
        borderLeftColor: leftColor,
        cursor: 'grab',
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity .15s',
      }}
    >
      <button type="button" onClick={handleDelete} className="card-delete" title="Mover para lixeira">×</button>

      <div className="card-name">{displayName}</div>

      {contactPerson ? (
        <div className="card-contact">{contactPerson}</div>
      ) : null}

      <div className="card-meta">
        <div className="card-meta-left">
          <span
            className={`card-value${hasValue ? '' : ' card-value--empty'}`}
            style={hasValue ? { color: isWon ? 'var(--green)' : 'var(--blue-dark)' } : undefined}
          >
            {hasValue ? formatBRL(opportunity.value!) : '—'}
          </span>
          {tierInfo ? (
            <span className={`tier-badge tier-${tier} card-tier`}>{tierInfo.label}</span>
          ) : null}
        </div>
        {opportunity.updated_at && !isWon ? (
          <span className="card-meta-date" style={{ color: daysColor, fontWeight: days > 7 ? 600 : 400 }}>
            {new Date(opportunity.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            {' · '}
            {daysLabel}
          </span>
        ) : null}
      </div>

      <div className="card-appt-row">
        {next && apptDisplay ? (
          <button
            type="button"
            className={`card-appt-chip ${apptDisplay.statusClass} appt-chip--with-bar`}
            style={apptTipoStyle(apptDisplay.tipoAccent)}
            onClick={(e) => handleSchedule(e, next)}
            title={`Editar: ${nextTipo?.label ?? next.tipo} · ${formatApptCardDate(next.scheduled_at)}`}
          >
            <span className="appt-tipo-bar" style={{ background: apptDisplay.tipoAccent }} aria-hidden="true" />
            <span className="card-appt-main">
              <AppointmentTipoIcon tipo={next.tipo} badge />
              <span className="card-appt-label">{nextTipo?.label ?? next.tipo}</span>
            </span>
            <span className="card-appt-date">{formatApptCardDate(next.scheduled_at)}</span>
          </button>
        ) : (
          <button type="button" className="card-appt-empty" onClick={(e) => handleSchedule(e)}>
            + Agendar
          </button>
        )}
      </div>
    </div>
  );
}
