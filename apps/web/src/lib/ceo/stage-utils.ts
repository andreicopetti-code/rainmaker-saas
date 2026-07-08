import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { resolveStageId } from '@/lib/funnel/stage-config';

const WIN_IDS = new Set(['GANHO', 'ganho']);
const LOSS_IDS = new Set(['PERDIDO', 'perdido']);

export function isWonStage(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 100) return true;
  return WIN_IDS.has(id) || WIN_IDS.has(stage);
}

export function isLostStage(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 0 && /perd/i.test(match.label)) return true;
  return LOSS_IDS.has(id) || LOSS_IDS.has(stage);
}

export function isActiveStage(stage: string, config: FunnelStageConfig[]): boolean {
  return !isWonStage(stage, config) && !isLostStage(stage, config);
}

export function getStageLabel(stage: string, config: FunnelStageConfig[]): string {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id) ?? config.find((s) => s.label === stage);
  return match?.label ?? stage;
}

export function stageProb(stage: string, config: FunnelStageConfig[]): number {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  return match?.prob ?? 50;
}

/** Index among visible active stages (excludes won/lost/hidden). */
export function activeStageIndex(stage: string, config: FunnelStageConfig[]): number {
  const active = config.filter((s) => !s.hidden && !isWonStage(s.id, config) && !isLostStage(s.id, config));
  const id = resolveStageId(stage, config);
  return active.findIndex((s) => s.id === id);
}

/** Last 2 active stages or prob >= 65 — used for "fechar agora" classification. */
export function isAdvancedStage(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match && match.prob >= 65) return true;

  const active = config.filter((s) => !s.hidden && !isWonStage(s.id, config) && !isLostStage(s.id, config));
  const idx = active.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  return idx >= active.length - 2;
}

export function visibleActiveStages(config: FunnelStageConfig[]): FunnelStageConfig[] {
  return config.filter((s) => !s.hidden && !isWonStage(s.id, config) && !isLostStage(s.id, config));
}
