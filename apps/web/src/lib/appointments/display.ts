import type { CSSProperties } from 'react';
import { appDateKey, isScheduledToday, todayInAppTz } from '@/lib/appointments/datetime';

/** Cores de compromisso: situação (chip) + tipo (barra/ícone). */

export type ApptStatus = 'future' | 'today' | 'overdue' | 'done';

export type ApptTipoColors = {
  accent: string;
  border: string;
};

/** Cor de destaque por tipo de compromisso (barra lateral + ícone). */
export const APPT_TIPO_COLORS: Record<string, ApptTipoColors> = {
  ligacao:      { accent: '#1D4ED8', border: '#93C5FD' },
  reuniao:      { accent: '#15803D', border: '#86EFAC' },
  whatsapp:     { accent: '#16A34A', border: '#86EFAC' },
  email:        { accent: '#C2410C', border: '#FDB38A' },
  visita:       { accent: '#92400E', border: '#FCD34D' },
  proposta:     { accent: '#6D28D9', border: '#C4B5FD' },
  followup:     { accent: '#B91C1C', border: '#FCA5A5' },
  demonstracao: { accent: '#0E7490', border: '#67E8F9' },
  outro:        { accent: '#374151', border: '#CBD5E1' },
};

export function getApptStatus(scheduledAt: string, done?: boolean): ApptStatus {
  if (done) return 'done';
  const today = todayInAppTz();
  const apptDay = appDateKey(scheduledAt);
  if (apptDay < today) return 'overdue';
  if (isScheduledToday(scheduledAt)) return 'today';
  return 'future';
}

export function getApptStatusClass(status: ApptStatus): string {
  return `appt-chip ${status}`;
}

export function getTipoColors(tipo: string): ApptTipoColors {
  return APPT_TIPO_COLORS[tipo] ?? APPT_TIPO_COLORS.outro;
}

export function getTipoAccent(tipo: string): string {
  return getTipoColors(tipo).accent;
}

export function getApptDisplay(tipo: string, scheduledAt: string, done?: boolean) {
  const status = getApptStatus(scheduledAt, done);
  const tipoColors = getTipoColors(tipo);
  return {
    status,
    statusClass: getApptStatusClass(status),
    tipoAccent: tipoColors.accent,
    tipoColors,
  };
}

/** Inline style para propagar cor do tipo aos filhos (badge). */
export function apptTipoStyle(accent: string): CSSProperties {
  return { '--appt-tipo-accent': accent } as CSSProperties;
}
