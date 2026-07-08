import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { DEFAULT_COLUMNS } from '@ceo-brain/shared';
import { getStageLabel, isLostStage, isWonStage } from './stage-utils';

export type StagePlaybookEntry = {
  proximoMovimento: string;
  tipoCompromisso: string;
  prazo: string;
};

const DEFAULT_PLAYBOOK: Record<string, StagePlaybookEntry> = {
  LEADS: { proximoMovimento: 'Qualificar fit e urgência (BANT) em até 48h', tipoCompromisso: 'Ligação', prazo: '48h' },
  QUALIFICADO: { proximoMovimento: 'Agendar reunião de descoberta com decisor', tipoCompromisso: 'Reunião', prazo: '3 dias' },
  REUNIÃO: { proximoMovimento: 'Enviar proposta personalizada em até 3 dias úteis', tipoCompromisso: 'Proposta', prazo: '3 dias' },
  REUNIAO: { proximoMovimento: 'Enviar proposta personalizada em até 3 dias úteis', tipoCompromisso: 'Proposta', prazo: '3 dias' },
  PROPOSTA_ENVIADA: { proximoMovimento: 'Confirmar recebimento e tratar objeções', tipoCompromisso: 'Retorno', prazo: '2 dias' },
  PROPOSTA: { proximoMovimento: 'Confirmar recebimento e tratar objeções', tipoCompromisso: 'Retorno', prazo: '2 dias' },
  NEGOCIAÇÃO: { proximoMovimento: 'Reunião de fechamento com decisor e condições finais', tipoCompromisso: 'Reunião', prazo: 'Esta semana' },
  NEGOCIACAO: { proximoMovimento: 'Reunião de fechamento com decisor e condições finais', tipoCompromisso: 'Reunião', prazo: 'Esta semana' },
  FECHAMENTO: { proximoMovimento: 'Assinatura do contrato e alinhamento de kick-off', tipoCompromisso: 'Reunião', prazo: '48h' },
  GANHO: { proximoMovimento: 'Handoff para entrega / onboarding', tipoCompromisso: '—', prazo: 'Imediato' },
  PERDIDO: { proximoMovimento: 'Registrar motivo da perda e aprendizado para o processo', tipoCompromisso: '—', prazo: '24h' },
};

function defaultHint(stageId: string): string {
  return DEFAULT_COLUMNS.find((c) => c.id === stageId)?.hint ?? 'Avance para a próxima etapa';
}

export function getStagePlaybook(stageId: string, config: FunnelStageConfig[]): StagePlaybookEntry {
  const id = stageId.toUpperCase().replace(/\s+/g, '_');
  const direct = DEFAULT_PLAYBOOK[stageId] ?? DEFAULT_PLAYBOOK[id];
  if (direct) return direct;

  const label = getStageLabel(stageId, config);
  const hint = defaultHint(stageId);
  if (isWonStage(stageId, config)) return DEFAULT_PLAYBOOK.GANHO;
  if (isLostStage(stageId, config)) return DEFAULT_PLAYBOOK.PERDIDO;

  return {
    proximoMovimento: hint,
    tipoCompromisso: 'Compromisso',
    prazo: 'Esta semana',
  };
}

export function buildPlaybookSection(config: FunnelStageConfig[]): string {
  const stages = config.filter((s) => !s.hidden);
  const lines = stages.map((s) => {
    const pb = getStagePlaybook(s.id, config);
    return `• ${s.label} (prob ${s.prob}%): ${pb.proximoMovimento} → ${pb.tipoCompromisso} (${pb.prazo})`;
  });
  return lines.join('\n');
}
