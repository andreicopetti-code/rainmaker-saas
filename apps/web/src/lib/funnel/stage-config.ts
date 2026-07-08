import { DEFAULT_COLUMNS, type PipelineColumn } from '@ceo-brain/shared';

export type FunnelStageConfig = {
  id: string;
  label: string;
  color: string;
  bg: string;
  text: string;
  prob: number;
  hidden?: boolean;
};

const PALETTE: Omit<FunnelStageConfig, 'id' | 'label'>[] = [
  { color: '#2563EB', bg: '#EFF6FF', text: '#1D4ED8', prob: 10 },
  { color: '#D97706', bg: '#FFFBEB', text: '#92400E', prob: 25 },
  { color: '#7C3AED', bg: '#F5F3FF', text: '#5B21B6', prob: 45 },
  { color: '#0891B2', bg: '#ECFEFF', text: '#0E7490', prob: 65 },
  { color: '#EA580C', bg: '#FFF7ED', text: '#9A3412', prob: 80 },
  { color: '#16A34A', bg: '#F0FDF4', text: '#15803D', prob: 100 },
  { color: '#DC2626', bg: '#FEF2F2', text: '#B91C1C', prob: 0 },
];

export function deriveColColors(hex: string): Pick<FunnelStageConfig, 'color' | 'bg' | 'text'> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const br = Math.round(r * 0.15 + 255 * 0.85);
  const bg2 = Math.round(g * 0.15 + 255 * 0.85);
  const bb = Math.round(b * 0.15 + 255 * 0.85);
  const tr = Math.round(r * 0.55);
  const tg = Math.round(g * 0.55);
  const tb = Math.round(b * 0.55);
  return {
    color: hex,
    bg: `rgb(${br},${bg2},${bb})`,
    text: `rgb(${tr},${tg},${tb})`,
  };
}

export function columnToStageConfig(col: PipelineColumn): FunnelStageConfig {
  return {
    id: col.id,
    label: col.label,
    color: col.color,
    bg: col.bg,
    text: col.text,
    prob: col.prob,
    hidden: false,
  };
}

export function defaultStageConfig(): FunnelStageConfig[] {
  return DEFAULT_COLUMNS.map(columnToStageConfig);
}

export function parseStageConfig(raw: unknown, stagesFallback?: string[]): FunnelStageConfig[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item, i) => {
      const o = item as Partial<FunnelStageConfig>;
      const palette = PALETTE[i % PALETTE.length];
      return {
        id: String(o.id ?? o.label ?? `stage_${i}`),
        label: String(o.label ?? o.id ?? `Etapa ${i + 1}`),
        color: o.color ?? palette.color,
        bg: o.bg ?? palette.bg,
        text: o.text ?? palette.text,
        prob: typeof o.prob === 'number' ? o.prob : palette.prob,
        hidden: o.hidden === true,
      };
    });
  }

  if (stagesFallback?.length) {
    return stagesFallback.map((label, i) => {
      const palette = PALETTE[i % PALETTE.length];
      return { id: label, label, ...palette, hidden: false };
    });
  }

  return defaultStageConfig();
}

export function visibleStages(config: FunnelStageConfig[]): FunnelStageConfig[] {
  return config.filter((s) => !s.hidden);
}

export function stagesLabels(config: FunnelStageConfig[]): string[] {
  return config.map((s) => s.label);
}

export function stageIds(config: FunnelStageConfig[]): string[] {
  return config.map((s) => s.id);
}

export function newStageId(): string {
  return `col_${Date.now()}`;
}

export function paletteForIndex(index: number): Omit<FunnelStageConfig, 'id' | 'label'> {
  return PALETTE[index % PALETTE.length];
}

/** Legacy CEO Brain HTML stage ids → default column labels. */
const LEGACY_STAGE_LABELS: Record<string, string> = {
  LEADS: 'Leads',
  QUALIFICADO: 'Qualificado',
  'REUNIÃO': 'Reunião',
  REUNIAO: 'Reunião',
  PROPOSTA_ENVIADA: 'Proposta',
  PROPOSTA: 'Proposta',
  'NEGOCIAÇÃO': 'Negociação',
  NEGOCIACAO: 'Negociação',
  FECHAMENTO: 'Fechamento',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

/** Map legacy stage to closest column by funnel position when labels differ. */
function legacyStageByPosition(stored: string, config: FunnelStageConfig[]): string | null {
  const legacyOrder = ['LEADS', 'QUALIFICADO', 'REUNIÃO', 'REUNIAO', 'PROPOSTA_ENVIADA', 'PROPOSTA', 'NEGOCIAÇÃO', 'NEGOCIACAO', 'FECHAMENTO', 'GANHO', 'PERDIDO'];
  const key = stored.toUpperCase();
  const legacyIdx = legacyOrder.indexOf(key);
  if (legacyIdx < 0) return null;

  const legacyActiveIdx: Record<string, number> = {
    LEADS: 0,
    QUALIFICADO: 1,
    'REUNIÃO': 2,
    REUNIAO: 2,
    PROPOSTA_ENVIADA: 3,
    PROPOSTA: 3,
    'NEGOCIAÇÃO': 4,
    NEGOCIACAO: 4,
    FECHAMENTO: 4,
  };

  const active = config.filter((s) => !s.hidden && s.prob !== 0 && s.prob !== 100);
  const won = config.find((s) => s.prob === 100 || /ganho/i.test(s.label));
  const lost = config.find((s) => s.prob === 0 || /perd/i.test(s.label));

  if (/ganho/i.test(key) || key === 'GANHO') return won?.id ?? null;
  if (/perd/i.test(key) || key === 'PERDIDO') return lost?.id ?? null;

  const pos = legacyActiveIdx[key];
  if (pos === undefined || active.length === 0) return null;

  const ratio = pos / 4; // legacy has ~5 active stages (0-4)
  const targetIdx = Math.min(active.length - 1, Math.round(ratio * (active.length - 1)));
  return active[targetIdx]?.id ?? null;
}

/** Resolve stage id from stored value (supports legacy ids and label-only data). */
export function resolveStageId(stored: string, config: FunnelStageConfig[]): string {
  if (config.some((s) => s.id === stored)) return stored;

  const byLabel = config.find((s) => s.label === stored);
  if (byLabel) return byLabel.id;

  const byCaseInsensitive = config.find((s) => s.label.toLowerCase() === stored.toLowerCase());
  if (byCaseInsensitive) return byCaseInsensitive.id;

  const legacyLabel = LEGACY_STAGE_LABELS[stored] ?? LEGACY_STAGE_LABELS[stored.toUpperCase()];
  if (legacyLabel) {
    const match = config.find((s) => s.label.toLowerCase() === legacyLabel.toLowerCase());
    if (match) return match.id;
  }

  const byPosition = legacyStageByPosition(stored, config);
  if (byPosition) return byPosition;

  return stored;
}

export function stageLabel(config: FunnelStageConfig[], stageId: string): string {
  const s = config.find((c) => c.id === stageId) ?? config.find((c) => c.label === stageId);
  return s?.label ?? stageId;
}
