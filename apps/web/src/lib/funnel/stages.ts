import { DEFAULT_COLUMNS } from '@ceo-brain/shared';
import type { FunnelStageConfig } from './stage-config';

export type StageStyle = {
  id: string;
  label: string;
  color: string;
  bg: string;
  text: string;
  prob: number;
  hidden?: boolean;
};

const FALLBACK_PALETTE: Omit<StageStyle, 'id' | 'label'>[] = [
  { color: '#2563EB', bg: '#EFF6FF', text: '#1D4ED8', prob: 10 },
  { color: '#D97706', bg: '#FFFBEB', text: '#92400E', prob: 25 },
  { color: '#7C3AED', bg: '#F5F3FF', text: '#5B21B6', prob: 45 },
  { color: '#0891B2', bg: '#ECFEFF', text: '#0E7490', prob: 65 },
  { color: '#EA580C', bg: '#FFF7ED', text: '#9A3412', prob: 80 },
  { color: '#16A34A', bg: '#F0FDF4', text: '#15803D', prob: 100 },
  { color: '#DC2626', bg: '#FEF2F2', text: '#B91C1C', prob: 0 },
];

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const COLUMN_BY_LABEL = new Map(
  DEFAULT_COLUMNS.map((c) => [normalize(c.label), c]),
);

/** Aliases entre etapas do staging e labels do legado */
const ALIASES: Record<string, string> = {
  prospeccao: 'leads',
  prospecção: 'leads',
  proposta: 'proposta',
  fechamento: 'negociacao',
  negociacao: 'negociacao',
  negociação: 'negociacao',
  ganho: 'ganho',
  perdido: 'perdido',
};

export function getStageStyle(stageName: string, index: number): StageStyle {
  const key = normalize(stageName);
  const alias = ALIASES[key] ?? key;
  const match =
    COLUMN_BY_LABEL.get(alias) ??
    COLUMN_BY_LABEL.get(key) ??
    DEFAULT_COLUMNS.find((c) => normalize(c.id) === alias);

  if (match) {
    return {
      id: stageName,
      label: stageName,
      color: match.color,
      bg: match.bg,
      text: match.text,
      prob: match.prob,
    };
  }

  const fb = FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
  return { ...fb, id: stageName, label: stageName };
}

export function buildStagesFromConfig(config: FunnelStageConfig[]): StageStyle[] {
  return config.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    bg: s.bg,
    text: s.text,
    prob: s.prob,
    hidden: s.hidden,
  }));
}

export function buildStages(stages: string[]): StageStyle[] {
  return stages.map((s, i) => getStageStyle(s, i));
}

export function buildVisibleStages(config: FunnelStageConfig[]): StageStyle[] {
  return buildStagesFromConfig(config.filter((s) => !s.hidden));
}

export function formatBRL(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
