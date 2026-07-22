import { TIERS } from '@ceo-brain/shared';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { formatApptCompact, scheduledAtToDate, APP_TIMEZONE } from '@/lib/appointments/datetime';
import { isMissingActionableValue, isValueDeferred } from '@/lib/funnel/value-deferred';
import { buildPlaybookSection, getStagePlaybook } from './playbook';
import {
  activeStageIndex,
  getStageLabel,
  isActiveStage,
  isAdvancedStage,
  isLostStage,
  isWonStage,
  stageProb,
  visibleActiveStages,
} from './stage-utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OppRow = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  probability: number | null;
  description: string | null;
  custom_fields: Record<string, unknown> | null;
  updated_at: string | null;
  tags?: string[] | null;
  expected_close_date?: string | null;
  next_appointment?: string | null;
  next_appt_tipo?: string | null;
  contact_name?: string | null;
  contact_company?: string | null;
  contact_setor?: string | null;
  lost_reason?: string | null;
};

export type AgendaEvent = {
  titulo: string;
  tipo: string;
  scheduledAt: string;
  dealNome: string | null;
  dealEtapa: string | null;
};

export type ChipFocus =
  | 'fechar' | 'risco' | 'parados' | 'descartar' | 'perdas'
  | 'velocidade' | 'conversao' | 'concentracao' | 'meta' | 'movimentos'
  | null;

const TIER_ORDER: Record<string, number> = { E: 0, G: 1, M: 2, P: 3 };

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTier(tierId?: string | null) {
  return TIERS.find((t) => t.id === tierId) ?? null;
}

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

function getTierId(opp: OppRow): string | undefined {
  const cf = opp.custom_fields;
  if (cf && typeof cf === 'object' && 'tier' in cf && typeof cf.tier === 'string') {
    return cf.tier;
  }
  return undefined;
}

function getNomePrimario(o: OppRow): string {
  return o.contact_company || o.contact_name || o.title;
}

function hasFutureAppt(o: OppRow): boolean {
  return !!o.next_appointment && new Date(o.next_appointment) > new Date();
}

function fmtApptDate(iso: string): string {
  return formatApptCompact(iso);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function dealPriority(a: OppRow, b: OppRow): number {
  const va = (a.value ?? 0) > 0 ? a.value! : 0;
  const vb = (b.value ?? 0) > 0 ? b.value! : 0;
  if (va !== vb) return vb - va;
  const ta = TIER_ORDER[getTierId(a) ?? ''] ?? 99;
  const tb = TIER_ORDER[getTierId(b) ?? ''] ?? 99;
  if (ta !== tb) return ta - tb;
  return daysAgo(b.updated_at) - daysAgo(a.updated_at);
}

function sortByPriority(opps: OppRow[]): OppRow[] {
  return [...opps].sort(dealPriority);
}

// ── Compact Deal Line ──────────────────────────────────────────────────────────

function buildCompactDealLine(o: OppRow, stageConfig: FunnelStageConfig[]): string {
  const tier = getTier(getTierId(o));
  const nome = getNomePrimario(o);
  const parts: string[] = [
    nome,
    tier ? `Classif: ${tier.label}` : '⚠ sem classificação',
    getStageLabel(o.stage, stageConfig),
  ];

  const dias = daysAgo(o.updated_at);
  if (dias >= 1) parts.push(`${dias}d parado`);

  if (o.next_appointment) {
    const tipo = o.next_appt_tipo
      ? o.next_appt_tipo.replace('followup', 'retorno').replace('demonstracao', 'demo')
      : 'compromisso';
    parts.push(`Próx: ${tipo} ${fmtApptDate(o.next_appointment)}`);
  } else if (isActiveStage(o.stage, stageConfig)) {
    parts.push('⚠ sem compromisso');
  }

  if (o.probability && o.probability > 0) parts.push(`Prob: ${o.probability}%`);

  if (o.expected_close_date) parts.push(`Fecha: ${fmtDate(o.expected_close_date)}`);

  if ((o.value ?? 0) > 0) {
    parts.push(`R$ ${(o.value!).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
  } else if (isValueDeferred(o.custom_fields)) {
    parts.push('valor pós-fechamento');
  } else if (isActiveStage(o.stage, stageConfig)) {
    parts.push('⚠ sem valor');
  }

  if (o.tags && o.tags.length > 0) parts.push(`Tags: ${o.tags.join(', ')}`);
  if (o.contact_setor) parts.push(`Setor: ${o.contact_setor}`);

  if (o.description) {
    const nota = o.description.slice(0, 100).replace(/\n/g, ' ');
    parts.push(`Nota: ${nota}`);
  } else {
    const tierVal = TIER_ORDER[getTierId(o) ?? ''] ?? 99;
    if (tierVal <= 1 && isActiveStage(o.stage, stageConfig)) {
      parts.push('⚠ sem nota');
    }
  }

  if (o.lost_reason && isLostStage(o.stage, stageConfig)) {
    parts.push(`Motivo: ${o.lost_reason.slice(0, 60)}`);
  }

  return parts.join(' | ');
}

// ── Compact Lists by Focus ─────────────────────────────────────────────────────

function buildDealsCompact(opps: OppRow[], focus: ChipFocus, stageConfig: FunnelStageConfig[]): string {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  const perdido = opps.filter((o) => isLostStage(o.stage, stageConfig));

  let deals: OppRow[];

  switch (focus) {
    case 'fechar':
    case 'movimentos':
      deals = sortByPriority(
        active.filter((o) => isAdvancedStage(o.stage, stageConfig) || (TIER_ORDER[getTierId(o) ?? ''] ?? 99) <= 1),
      ).slice(0, 12);
      break;

    case 'risco':
      deals = active.filter((o) => {
        const dias = daysAgo(o.updated_at);
        const tierVal = TIER_ORDER[getTierId(o) ?? ''] ?? 99;
        return (dias >= 7 && !hasFutureAppt(o)) || (dias >= 14 && tierVal <= 1);
      });
      break;

    case 'parados':
      deals = active
        .filter((o) => daysAgo(o.updated_at) >= 7 && !hasFutureAppt(o))
        .sort((a, b) => daysAgo(b.updated_at) - daysAgo(a.updated_at));
      break;

    case 'descartar':
      deals = active.filter((o) => {
        const tierVal = TIER_ORDER[getTierId(o) ?? ''] ?? 99;
        const dias = daysAgo(o.updated_at);
        return (dias >= 45 && tierVal >= 3) || dias >= 60;
      });
      break;

    case 'perdas':
      deals = [...perdido]
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
        .slice(0, 15);
      break;

    case 'meta':
      deals = sortByPriority(
        active.filter((o) => {
          const closeDate = o.expected_close_date ? new Date(o.expected_close_date) : null;
          const thisMonth = new Date();
          return !closeDate || (closeDate.getFullYear() === thisMonth.getFullYear() && closeDate.getMonth() === thisMonth.getMonth());
        }),
      );
      break;

    default:
      deals = sortByPriority(active);
  }

  if (deals.length === 0) return 'Nenhum negócio nesta categoria.';
  return deals.map((o) => buildCompactDealLine(o, stageConfig)).join('\n');
}

// ── Agenda Formatter ───────────────────────────────────────────────────────────

function buildAgendaLines(events: AgendaEvent[]): string {
  if (!events.length) return 'Nenhum compromisso nos próximos 7 dias.';
  return events
    .slice(0, 15)
    .map((ev) => {
      const deal = ev.dealNome
        ? ` [${ev.dealNome}${ev.dealEtapa ? ' · ' + ev.dealEtapa : ''}]`
        : '';
      return `${fmtApptDate(ev.scheduledAt)} — ${ev.tipo.replace('followup', 'retorno').replace('demonstracao', 'demo')}: ${ev.titulo}${deal}`;
    })
    .join('\n');
}

/** Compromissos apenas de hoje (Brasília) — base para a seção ⏰ HOJE. */
function buildTodayAgendaLines(events: AgendaEvent[]): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
  const todayEvents = events
    .filter((ev) => scheduledAtToDate(ev.scheduledAt) === today)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (!todayEvents.length) return 'Nenhum compromisso agendado para hoje.';

  return todayEvents
    .map((ev) => {
      const parts = formatApptCompact(ev.scheduledAt).split('·');
      const hora = parts[1]?.trim() ?? '?';
      const deal = ev.dealNome ?? 'Compromisso avulso';
      const tipo = ev.tipo.replace('followup', 'retorno').replace('demonstracao', 'demo');
      return `• ${hora} | ${deal} — ${tipo}: ${ev.titulo}`;
    })
    .join('\n');
}

/** Top 3 candidatos a fechamento — inclui etapas avançadas mesmo com cadastro incompleto. */
function buildTopClosingCandidates(
  opps: OppRow[],
  stageConfig: FunnelStageConfig[],
  classif: ReturnType<typeof classifyDeals>,
): string {
  if (classif.fechar.length > 0) {
    return classif.fechar
      .slice(0, 3)
      .map((c, i) => {
        const valor = c.valor
          ? `R$ ${c.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
          : c.valorDeferred
            ? 'valor pós-fechamento'
            : 'sem valor cadastrado';
        return `${i + 1}. ${c.nome} | ${c.tier} | ${c.etapa} | ${valor}`;
      })
      .join('\n');
  }

  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  const activeStages = visibleActiveStages(stageConfig);
  const closingStageMinIdx = Math.max(0, activeStages.length - 3);

  const candidates = sortByPriority(
    active.filter((o) => {
      const idx = activeStageIndex(o.stage, stageConfig);
      return idx >= closingStageMinIdx || stageProb(o.stage, stageConfig) >= 55;
    }),
  ).slice(0, 3);

  if (!candidates.length) {
    return 'Nenhum negócio em etapa avançada — priorize mover 2–3 Grandes/Estratégicos da prospecção.';
  }

  return candidates
    .map((o, i) => {
      const nome = getNomePrimario(o);
      const etapa = getStageLabel(o.stage, stageConfig);
      const tier = getTier(getTierId(o))?.label ?? 'Sem classificação';
      const bloqueios: string[] = [];
      if (isMissingActionableValue(o.value, o.custom_fields)) bloqueios.push('sem valor');
      if (!hasFutureAppt(o)) bloqueios.push('sem compromisso');
      if (!o.description?.trim() && (TIER_ORDER[getTierId(o) ?? ''] ?? 99) <= 1) bloqueios.push('sem nota');
      const pb = getStagePlaybook(o.stage, stageConfig);
      const bloqueioStr = bloqueios.length ? ` | bloqueio: ${bloqueios.join(', ')}` : '';
      const valorNota =
        !(o.value ?? 0) && isValueDeferred(o.custom_fields) ? ' | valor pós-fechamento' : '';
      return `${i + 1}. ${nome} | ${tier} | ${etapa}${valorNota}${bloqueioStr} → ${pb.proximoMovimento}`;
    })
    .join('\n');
}

function buildTopRisks(classif: ReturnType<typeof classifyDeals>, limit = 3): string {
  if (!classif.risco.length) return 'Nenhum risco crítico pré-classificado além dos alertas de cadastro.';
  return classif.risco
    .slice(0, limit)
    .map((c) => `• ${c.nome} | ${c.tier} | ${c.etapa}`)
    .join('\n');
}

function buildCadastroResumo(alerts: DataQualityAlerts): string {
  const parts: string[] = [];
  if (alerts.semValor.length) parts.push(`${alerts.semValor.length} sem valor estimado`);
  if (alerts.semNota.length) parts.push(`${alerts.semNota.length} E/G sem nota`);
  if (alerts.semCompromisso.length) parts.push(`${alerts.semCompromisso.length} sem compromisso futuro`);
  if (alerts.semClassificacao.length) parts.push(`${alerts.semClassificacao.length} sem classificação`);
  if (!parts.length) return 'Cadastro OK — sem bloqueios graves de dados.';
  return parts.join(' | ');
}

// ── Data Quality ───────────────────────────────────────────────────────────────

export type DataQualityAlerts = {
  semValor: string[];
  semClassificacao: string[];
  semCompromisso: string[];
  semNota: string[];
};

export function buildDataQualityAlerts(opps: OppRow[], stageConfig: FunnelStageConfig[]): DataQualityAlerts {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  return {
    semValor: active
      .filter((o) => isMissingActionableValue(o.value, o.custom_fields))
      .map(getNomePrimario),
    semClassificacao: active.filter((o) => !getTierId(o)).map(getNomePrimario),
    semCompromisso: active.filter((o) => !hasFutureAppt(o)).map(getNomePrimario),
    semNota: active
      .filter((o) => {
        const tierVal = TIER_ORDER[getTierId(o) ?? ''] ?? 99;
        return tierVal <= 1 && !o.description?.trim();
      })
      .map(getNomePrimario),
  };
}

function formatDataQualitySection(alerts: DataQualityAlerts, compromissosAtrasados: number): string {
  const lines: string[] = [];
  if (alerts.semValor.length > 0) {
    lines.push(`⚠️ ${alerts.semValor.length} negócio(s) sem valor: ${alerts.semValor.slice(0, 8).join(', ')}${alerts.semValor.length > 8 ? '…' : ''}`);
  }
  if (alerts.semClassificacao.length > 0) {
    lines.push(`⚠️ ${alerts.semClassificacao.length} negócio(s) sem classificação: ${alerts.semClassificacao.slice(0, 8).join(', ')}${alerts.semClassificacao.length > 8 ? '…' : ''}`);
  }
  if (alerts.semCompromisso.length > 0) {
    lines.push(`⚠️ ${alerts.semCompromisso.length} negócio(s) ativos sem compromisso futuro`);
  }
  if (alerts.semNota.length > 0) {
    lines.push(`⚠️ ${alerts.semNota.length} negócio(s) E/G sem nota: ${alerts.semNota.slice(0, 6).join(', ')}${alerts.semNota.length > 6 ? '…' : ''}`);
  }
  if (compromissosAtrasados > 0) {
    lines.push(`🔴 ${compromissosAtrasados} compromisso(s) atrasado(s) não cumpridos`);
  }
  if (lines.length === 0) return '✓ Qualidade de dados OK — valor, classificação e compromissos em ordem.';
  return lines.join('\n');
}

// ── Public Types ───────────────────────────────────────────────────────────────

export type FunnelContext = ReturnType<typeof buildFunnelContext>;
export type DealClassification = ReturnType<typeof classifyDeals>;
export type HealthScore = ReturnType<typeof calcHealthScore>;

// ── Context Builder ────────────────────────────────────────────────────────────

export function buildFunnelContext(opps: OppRow[], stageConfig: FunnelStageConfig[]) {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  const ganho = opps.filter((o) => isWonStage(o.stage, stageConfig));
  const perdido = opps.filter((o) => isLostStage(o.stage, stageConfig));

  const receitaConfirmada = ganho.reduce((s, o) => s + (o.value ?? 0), 0);
  const receitaRealAberta = active.reduce((s, o) => s + (o.value ?? 0), 0);
  const dealsComValorReal = active.filter((o) => (o.value ?? 0) > 0).length;
  const valorPosFechamento = active.filter(
    (o) => !(o.value ?? 0) && isValueDeferred(o.custom_fields),
  ).length;
  const semValorDefinido = active.filter((o) =>
    isMissingActionableValue(o.value, o.custom_fields),
  ).length;
  const semTierDefinido = active.filter((o) => !getTierId(o)).length;
  const semCompromisso = active.filter((o) => !hasFutureAppt(o)).length;

  const decisivos = ganho.length + perdido.length;
  const winRate = decisivos > 0 ? ((ganho.length / decisivos) * 100).toFixed(1) : '0';

  const porTier = TIERS.map((t) => {
    const deals = active.filter((o) => getTierId(o) === t.id);
    const comValor = deals.filter((o) => (o.value ?? 0) > 0);
    return {
      tier: t.label,
      faixaReferencia: t.desc,
      quantidade: deals.length,
      receitaRealSomada: comValor.reduce((s, o) => s + (o.value ?? 0), 0),
      dealsComValorPreenchido: comValor.length,
    };
  });

  const allStages = stageConfig.filter((s) => !s.hidden);
  const porEtapa = allStages.map((stage) => {
    const deals = opps.filter((o) => {
      const label = getStageLabel(o.stage, stageConfig);
      return o.stage === stage.id || label === stage.label;
    });
    const recReal = deals.reduce((s, o) => s + (o.value ?? 0), 0);
    return { etapa: stage.label, quantidade: deals.length, receitaReal: recReal, prob: stage.prob };
  });

  const top5 = sortByPriority(active).slice(0, 5).map((o) => {
    const tier = getTier(getTierId(o));
    const pb = getStagePlaybook(o.stage, stageConfig);
    return {
      nome: getNomePrimario(o),
      etapa: getStageLabel(o.stage, stageConfig),
      tier: tier ? tier.label : 'Não definido',
      valor: (o.value ?? 0) > 0 ? o.value : null,
      diasSemAtividade: daysAgo(o.updated_at),
      proximoMovimento: pb.proximoMovimento,
      nota: o.description ?? '',
    };
  });

  return {
    resumo: {
      total: opps.length,
      ganhos: ganho.length,
      perdidos: perdido.length,
      taxaConversao: winRate + '%',
      receitaConfirmada,
      receitaRealAberta,
      dealsComValorReal,
      valorPosFechamento,
      semValorDefinido,
      semTierDefinido,
      semCompromisso,
    },
    porTier,
    porEtapa,
    top5PorPrioridade: top5,
    etapasAtivas: visibleActiveStages(stageConfig).length,
  };
}

// ── Deals Parados ──────────────────────────────────────────────────────────────

export function buildDealsParados(opps: OppRow[], stageConfig: FunnelStageConfig[], minDays = 7) {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  return active
    .map((o) => ({
      nome: getNomePrimario(o),
      contato: o.contact_name ?? null,
      setor: o.contact_setor ?? null,
      etapa: getStageLabel(o.stage, stageConfig),
      tier: getTier(getTierId(o))?.label ?? 'Não definido',
      valor: (o.value ?? 0) > 0 ? o.value : null,
      diasSemAtividade: daysAgo(o.updated_at),
      proximoCompromisso: o.next_appointment
        ? `${o.next_appt_tipo ?? 'compromisso'} ${fmtApptDate(o.next_appointment)}`
        : null,
      nota: o.description ?? '',
      temCompromissoFuturo: hasFutureAppt(o),
    }))
    .filter((o) => o.diasSemAtividade >= minDays && !o.temCompromissoFuturo)
    .sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);
}

// ── Deal Classification ────────────────────────────────────────────────────────

export function classifyDeals(opps: OppRow[], stageConfig: FunnelStageConfig[]) {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  const parados = buildDealsParados(opps, stageConfig, 7);
  const paradoMap = new Map(parados.map((p) => [p.nome, p.diasSemAtividade]));

  type DealRef = {
    nome: string;
    etapa: string;
    tier: string;
    valor: number | null;
    valorDeferred?: boolean;
    nota: string;
  };
  const result: { fechar: DealRef[]; risco: DealRef[]; cultivar: DealRef[]; descartar: DealRef[] } = {
    fechar: [], risco: [], cultivar: [], descartar: [],
  };

  active.forEach((o) => {
    const dias = daysAgo(o.updated_at);
    const tierVal = TIER_ORDER[getTierId(o) ?? ''] ?? 99;
    const diasParado = paradoMap.get(getNomePrimario(o)) ?? 0;
    const activeStages = visibleActiveStages(stageConfig);
    const stageIdx = activeStageIndex(o.stage, stageConfig);
    const emEtapaDeFechamento = stageIdx >= Math.max(0, activeStages.length - 3);
    const avancada = isAdvancedStage(o.stage, stageConfig) || emEtapaDeFechamento;
    const probAlta = (o.probability ?? stageProb(o.stage, stageConfig)) >= 60;
    const valorAlto = (o.value ?? 0) >= 100_000;
    const prioridadeAlta = tierVal <= 1 || valorAlto;
    const ref: DealRef = {
      nome: getNomePrimario(o),
      etapa: getStageLabel(o.stage, stageConfig),
      tier: getTier(getTierId(o))?.label ?? 'Não definido',
      valor: (o.value ?? 0) > 0 ? o.value : null,
      valorDeferred: !(o.value ?? 0) && isValueDeferred(o.custom_fields),
      nota: o.description ?? '',
    };

    if (avancada && prioridadeAlta && (dias <= 45 || probAlta || hasFutureAppt(o) || emEtapaDeFechamento)) {
      result.fechar.push(ref);
    } else if ((diasParado >= 14 && prioridadeAlta) || diasParado >= 21 || (emEtapaDeFechamento && !hasFutureAppt(o) && prioridadeAlta)) {
      result.risco.push(ref);
    } else if ((dias >= 60 && tierVal >= 3) || diasParado >= 45) {
      result.risco.push(ref);
    } else if ((dias >= 60 && tierVal >= 3) || diasParado >= 45) {
      result.descartar.push(ref);
    } else {
      result.cultivar.push(ref);
    }
  });

  return result;
}

// ── Health Score ───────────────────────────────────────────────────────────────

export function calcHealthScore(opps: OppRow[], context: FunnelContext, stageConfig: FunnelStageConfig[]) {
  const active = opps.filter((o) => isActiveStage(o.stage, stageConfig));
  const total = active.length;
  if (total === 0) return { score: 0, label: 'Crítico', color: '#DC2626' };

  const parados7 = buildDealsParados(opps, stageConfig, 7).length;
  const scoreParados = Math.max(0, 25 - Math.round((parados7 / total) * 25));

  const semAcao = active.filter((o) => daysAgo(o.updated_at) >= 14).length;
  const scoreSemAcao = Math.max(0, 20 - Math.round((semAcao / total) * 20));

  const decisivos = context.resumo.ganhos + context.resumo.perdidos;
  const winRate = decisivos > 0 ? context.resumo.ganhos / decisivos : 0;
  const scoreConversao = Math.round(Math.min(winRate * 50, 20));

  const avancadosSemValor = active.filter(
    (o) =>
      isAdvancedStage(o.stage, stageConfig) &&
      isMissingActionableValue(o.value, o.custom_fields),
  ).length;
  const scoreDados = Math.max(
    0,
    15 - Math.round((context.resumo.semValorDefinido / total) * 8)
      - Math.round((context.resumo.semCompromisso / total) * 7)
      - Math.round((avancadosSemValor / Math.max(total, 1)) * 5),
  );

  const sorted = [...active].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const potTotal = active.reduce((s, o) => s + ((o.value ?? 0) > 0 ? (o.value ?? 0) : 0), 0);
  const pot2 = sorted.slice(0, 2).reduce((s, o) => s + (o.value ?? 0), 0);
  const concentracao = potTotal > 0 ? pot2 / potTotal : 0;
  const scoreConc = concentracao > 0.7 ? 5 : concentracao > 0.5 ? 10 : 20;

  const score = Math.min(100, scoreParados + scoreSemAcao + scoreConversao + scoreDados + scoreConc);
  const label = score >= 80 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Crítico';
  const color = score >= 80 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';

  return { score, label, color };
}

// ── Common Prompt Header ───────────────────────────────────────────────────────

function buildPromptBase(health: HealthScore, stageConfig: FunnelStageConfig[]): string {
  const now = new Date();
  const dataHoje = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const horaAgora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const playbook = buildPlaybookSection(stageConfig);

  return `Você é o RainMaker — assistente executivo de vendas. Aja como um Diretor Comercial sênior com 20 anos de experiência. Emita opiniões, identifique riscos reais, priorize com clareza e oriente decisões de receita.

HOJE É: ${dataHoje}, ${horaAgora} (horário de Brasília)
Use esta data como referência para interpretar todos os compromissos, prazos e urgências. Nunca confunda uma data futura com "hoje".

═══════════════════════════════
REGRA ABSOLUTA — VALORES MONETÁRIOS
═══════════════════════════════
• A Classificação (Pequeno/Médio/Grande/Estratégico) é PRIORIDADE — não é valor em R$
• NUNCA converta Classificação em valores monetários. PROIBIDO: "R$ 750.000 (Estratégico)"
• Cite valores em R$ SOMENTE quando o campo R$ estiver presente na linha do negócio
• Sem valor preenchido: mencione classificação e urgência, não invente valores

═══════════════════════════════
PLAYBOOK DE VENDAS (por etapa do funil)
═══════════════════════════════
${playbook}

Para cada negócio citado, estruture ações como: O QUÊ fazer | PARA QUEM | ATÉ QUANDO
Use a etapa atual, próximo compromisso e nota para personalizar — nunca sugira ação genérica se a etapa já indica o movimento correto.

═══════════════════════════════
REGRAS DE LINGUAGEM — OBRIGATÓRIAS
═══════════════════════════════
• Responda SEMPRE em português brasileiro claro e direto
• PROIBIDO usar termos em inglês. Substituições obrigatórias:
  - "deal" / "deals" → "negócio" / "negócios" ou "oportunidade" / "oportunidades"
  - "pipeline" → "carteira" ou "funil de vendas"
  - "follow-up" → "retorno" ou "acompanhamento"
  - "briefing" → "resumo" ou "diagnóstico"
  - "insight" → "observação" ou "conclusão"
  - "forecast" → "projeção"
  - "lead" / "leads" → "contato" / "contatos" ou "prospecto" / "prospectos"
  - "score" → "índice" ou "pontuação"
  - "tier" → "classificação" ou "porte"
  - "status" → "situação" ou "estado"
  - "checklist" → "lista de ações"
  - "overview" → "visão geral"
• Tom: direto, executivo, assertivo — como um sócio que conhece o negócio
• Cite nomes de empresas, classificação, dias parado, etapa do funil e valor R$ quando disponível
• Nunca diga "não tenho informações suficientes" — analise o que está disponível
• Nunca repita os dados brutos na resposta
• PROIBIDO: "entrar em contato", "verificar andamento", "acompanhar de perto" — seja específico
• Use linguagem direta: "esse negócio está esfriando", "risco real de perda", "concentração perigosa"
• Se houver Nota no negócio, USE-A para personalizar a ação
• Se houver compromisso agendado, leve em conta na análise
• Negócios marcados com ⚠ sem valor / sem compromisso / sem nota exigem ação de cadastro antes de estratégia
• Negócios com "valor pós-fechamento" NÃO estão incompletos: o valor só será conhecido no fechamento/resultado. Não peça cadastro de valor nesses casos; priorize próxima ação comercial.
• PROIBIDO inventar cargos ou equipes ("Gerente de Negócios", "Equipe de Dados") — use "você" ou omita responsável
• Negócios em Negociação/Proposta/Fechamento SEM compromisso = risco de esfriamento, NÃO "nenhum fechamento possível"

═══════════════════════════════
SAÚDE DA CARTEIRA DE VENDAS
═══════════════════════════════
Índice: ${health.score}/100 — ${health.label}`;
}

function buildBriefingFormatRules(): string {
  return `
═══════════════════════════════
REGRAS DE FORMATAÇÃO — BRIEFING INICIAL
═══════════════════════════════
• Use EXATAMENTE estas seções, nesta ordem, com estes emojis (omitir seção vazia, exceto 🎯):
  ⏰ HOJE → 🧭 DIAGNÓSTICO EXECUTIVO → 🔥 FECHAR ESTA SEMANA → ⚠️ RISCOS IMEDIATOS → 📋 CADASTRO → 🎯 AÇÕES IMEDIATAS
• Título de seção: emoji + texto (linha isolada). Ex.: "🔥 FECHAR ESTA SEMANA"
• Máx. 2 linhas em ⏰ HOJE; máx. 3 linhas em 🧭; exatamente 3 negócios em 🔥; máx. 3 bullets em ⚠️; máx. 2 bullets em 📋
• Entre seções: 1 linha em branco
• PROIBIDO usar travessão (—) repetido na mesma linha para empilhar informação
• PROIBIDO repetir a mesma empresa em mais de uma seção
• PROIBIDO listar mais de 3 empresas em uma única bullet — prefira top 3 + "e outros N"
• PROIBIDO seções duplicadas (não crie "Alertas" e "Qualidade de dados" separados — use 📋 CADASTRO)

FORMATO OBRIGATÓRIO — cada negócio em 🔥 (3 linhas, sem travessões):
1. **NOME DA EMPRESA**
Etapa · Classificação
→ Movimento concreto em uma frase.

FORMATO OBRIGATÓRIO — cada risco em ⚠️ (2 linhas):
• **NOME** — causa do risco em poucas palavras
→ Ação corretiva em uma frase.

• 🎯 AÇÕES IMEDIATAS: 3 a 5 bullets — UMA ação por linha (empresa + verbo + prazo). PROIBIDO ponto e vírgula ou texto corrido
• Se 🔥 FECHAR estiver vazio na classificação automática, use os CANDIDATOS A FECHAMENTO fornecidos — nunca diga "nenhum negócio"`;
}

function buildMovimentosAnswerTemplate(): string {
  return `
FORMATO OBRIGATÓRIO — responda EXATAMENTE nesta estrutura (copie os títulos):

🎯 3 MOVIMENTOS ESTRATÉGICOS (próximas 2 semanas)

1. **[Título do movimento]** — [1 linha: o que muda na receita]
   • **[Empresa]**: [verbo imperativo + prazo até DD/MM]
   • **[Empresa]**: [verbo imperativo + prazo] (opcional; máx. 2 empresas por movimento)

2. **[Título do movimento]** — [impacto em 1 linha]
   • **[Empresa]**: [ação + prazo]

3. **[Título do movimento]** — [impacto em 1 linha]
   • **[Empresa]**: [ação + prazo]

Regras: exatamente 3 movimentos; cada um com 1-2 bullets concretos; empresas da lista NEGÓCIOS ATIVOS; prazos dentro de 14 dias; PROIBIDO parágrafo introdutório.`;
}

function buildFecharAnswerTemplate(): string {
  return `
FORMATO OBRIGATÓRIO — responda EXATAMENTE nesta estrutura (copie os títulos):

🔥 FECHAR AGORA

1. **NOME EXATO DA EMPRESA**
Etapa · Classificação · próximo compromisso (ou "sem agenda")
→ Ação 1; Ação 2; Ação 3 — tudo em UMA linha após →, com prazos até sexta

2. **SEGUNDA EMPRESA**
Etapa · Classificação · ...
→ ...

Regras:
• Máximo 3 negócios; nomes EXATOS da lista NEGÓCIOS ATIVOS (entre **)
• Cada negócio = exatamente 3 linhas (título numerado, meta, → ações)
• PROIBIDO tabelas markdown (| col |), cabeçalhos ### e listas numeradas soltas de ações`;
}

function buildRiscoAnswerTemplate(): string {
  return `
FORMATO OBRIGATÓRIO — responda EXATAMENTE nesta estrutura:

⚠️ EM RISCO

• **NOME EXATO** — causa do risco em poucas palavras
→ Ação corretiva com prazo até DD/MM

• **NOME EXATO** — causa
→ Ação corretiva

Regras: máx. 5 negócios; PROIBIDO tabelas markdown e cabeçalhos ###; cada risco = 2 linhas (bullet + →)`;
}

function buildParadosAnswerTemplate(): string {
  return `
FORMATO OBRIGATÓRIO — responda EXATAMENTE nesta estrutura:

⏰ REATIVAR PARADOS

1. **NOME EXATO**
Etapa · X dias parado · Classificação
→ Plano de reativação em UMA linha (2-3 passos com prazo)

Regras: PROIBIDO tabelas markdown e ###; cada negócio = 3 linhas (numerado, meta, →)`;
}

function buildDescartarAnswerTemplate(): string {
  return `
FORMATO OBRIGATÓRIO — responda EXATAMENTE nesta estrutura:

🗑️ DESCARTAR DA CARTEIRA

• **NOME EXATO** — motivo objetivo (dados do funil)
→ Como liberar foco (arquivar/perder + próximo passo)

Regras: PROIBIDO tabelas markdown e ###; cada item = 2 linhas (bullet + →)`;
}

function buildChatAnswerRules(chipFocus: ChipFocus): string {
  const base = `
═══════════════════════════════
MODO RESPOSTA — PERGUNTA / CHIP (NÃO É BRIEFING)
═══════════════════════════════
• Responda SOMENTE ao que o usuário perguntou — direto ao ponto
• PROIBIDO usar seções do briefing: ⏰ HOJE, 🧭 DIAGNÓSTICO EXECUTIVO, 🔥 FECHAR ESTA SEMANA, ⚠️ RISCOS IMEDIATOS, 📋 CADASTRO
• PROIBIDO repetir ou resumir o briefing que já apareceu no histórico do chat
• PROIBIDO saudação, "índice de saúde" ou diagnóstico geral — salvo se a pergunta pedir explicitamente
• Cite empresas reais do funil; verbos imperativos; prazos concretos
• PROIBIDO tabelas markdown (|) e cabeçalhos ### — use cards conforme template abaixo
• Máximo ~25 linhas, salvo se a pergunta pedir lista maior`;

  if (chipFocus === 'movimentos') {
    return `${base}
${buildMovimentosAnswerTemplate()}`;
  }
  if (chipFocus === 'fechar') {
    return `${base}
${buildFecharAnswerTemplate()}`;
  }
  if (chipFocus === 'risco') {
    return `${base}
${buildRiscoAnswerTemplate()}`;
  }
  if (chipFocus === 'parados') {
    return `${base}
${buildParadosAnswerTemplate()}`;
  }
  if (chipFocus === 'descartar') {
    return `${base}
${buildDescartarAnswerTemplate()}`;
  }

  return base;
}

function buildPromptHeader(health: HealthScore, stageConfig: FunnelStageConfig[]): string {
  return `${buildPromptBase(health, stageConfig)}${buildBriefingFormatRules()}`;
}

// ── System Prompt (follow-up questions) ────────────────────────────────────────

export function buildSystemPrompt(
  opps: OppRow[],
  context: FunnelContext,
  dealsParados: ReturnType<typeof buildDealsParados>,
  classif: DealClassification,
  health: HealthScore,
  stageConfig: FunnelStageConfig[],
  agendaEvents: AgendaEvent[] = [],
  compromissosAtrasados = 0,
  chipFocus: ChipFocus = null,
) {
  const fecharNomes = classif.fechar.map((c) => c.nome).join(', ') || 'Nenhum';
  const riscoNomes = classif.risco.map((c) => c.nome).join(', ') || 'Nenhum';
  const alerts = buildDataQualityAlerts(opps, stageConfig);

  const dealsSection = buildDealsCompact(opps, chipFocus, stageConfig);

  const paradosSection = dealsParados.length > 0
    ? dealsParados.map((d) =>
        `${d.nome} | ${d.tier} | ${d.etapa} | ${d.diasSemAtividade}d parado${d.valor ? ` | R$ ${d.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : ''}${d.nota ? ` | Nota: ${d.nota.slice(0, 80)}` : ''}`,
      ).join('\n')
    : 'Nenhum negócio parado identificado.';

  const resumo = context.resumo;

  return `${buildPromptBase(health, stageConfig)}

${buildChatAnswerRules(chipFocus)}

═══════════════════════════════
RESUMO DO FUNIL DE VENDAS
═══════════════════════════════
Total: ${resumo.total} negócios | Ganhos: ${resumo.ganhos} | Perdidos: ${resumo.perdidos}
Conversão: ${resumo.taxaConversao}${resumo.receitaConfirmada > 0 ? ` | Receita Confirmada: R$ ${resumo.receitaConfirmada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : ''}
${resumo.receitaRealAberta > 0 ? `Receita em aberto: R$ ${resumo.receitaRealAberta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${resumo.dealsComValorReal} negócios com valor preenchido)` : ''}

═══════════════════════════════
QUALIDADE DE DADOS
═══════════════════════════════
${formatDataQualitySection(alerts, compromissosAtrasados)}

═══════════════════════════════
CLASSIFICAÇÃO ATUAL
═══════════════════════════════
🔥 Fechar agora: ${fecharNomes}
⚠️ Em risco: ${riscoNomes}

═══════════════════════════════
NEGÓCIOS ATIVOS${chipFocus ? ` (foco: ${chipFocus})` : ''}
═══════════════════════════════
(EMPRESA | CLASSIF | ETAPA | dias parado | Próx compromisso | Prob | Fecha | R$ | Nota)
${dealsSection}

═══════════════════════════════
NEGÓCIOS PARADOS (>7 dias sem atividade)
═══════════════════════════════
${paradosSection}
${agendaEvents.length > 0 ? `
═══════════════════════════════
AGENDA — PRÓXIMOS 7 DIAS
═══════════════════════════════
${buildAgendaLines(agendaEvents)}` : ''}`;
}

// ── Briefing Prompt ────────────────────────────────────────────────────────────

export function buildBriefingPrompt(
  opps: OppRow[],
  context: FunnelContext,
  dealsParados: ReturnType<typeof buildDealsParados>,
  classif: DealClassification,
  health: HealthScore,
  stageConfig: FunnelStageConfig[],
  agendaEvents: AgendaEvent[] = [],
  compromissosAtrasados = 0,
) {
  const classifDetalhado = {
    fecharAgora: classif.fechar.map((c) => ({ nome: c.nome, etapa: c.etapa, tier: c.tier, valor: c.valor, nota: c.nota })),
    emRisco: classif.risco.map((c) => ({ nome: c.nome, etapa: c.etapa, tier: c.tier, valor: c.valor, nota: c.nota })),
    cultivar: classif.cultivar.length,
    descartar: classif.descartar.map((c) => ({ nome: c.nome, etapa: c.etapa })),
  };

  const alerts = buildDataQualityAlerts(opps, stageConfig);
  const dealsCompact = buildDealsCompact(opps, null, stageConfig);
  const paradosCompact = dealsParados.length > 0
    ? dealsParados.map((d) =>
        `${d.nome} | ${d.tier} | ${d.etapa} | ${d.diasSemAtividade}d${d.valor ? ` | R$ ${d.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : ''}${d.nota ? ` | Nota: ${d.nota.slice(0, 80)}` : ''}`,
      ).join('\n')
    : 'Nenhum negócio parado.';

  const resumo = context.resumo;
  const porEtapaLines = context.porEtapa
    .map((e) => `${e.etapa}: ${e.quantidade}${e.receitaReal > 0 ? ` (R$ ${e.receitaReal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})` : ''}`)
    .join(' | ');

  return `${buildPromptHeader(health, stageConfig)}

═══════════════════════════════
CLASSIFICAÇÃO DOS NEGÓCIOS
═══════════════════════════════
${JSON.stringify(classifDetalhado, null, 2)}

═══════════════════════════════
RESUMO QUANTITATIVO
═══════════════════════════════
Total: ${resumo.total} | Ganhos: ${resumo.ganhos} | Perdidos: ${resumo.perdidos} | Conversão: ${resumo.taxaConversao}
${resumo.receitaConfirmada > 0 ? `Receita confirmada: R$ ${resumo.receitaConfirmada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'Sem receita confirmada ainda.'}
${resumo.receitaRealAberta > 0 ? `Receita em aberto: R$ ${resumo.receitaRealAberta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${resumo.dealsComValorReal} negócios com valor preenchido)` : ''}

POR ETAPA: ${porEtapaLines}

POR CLASSIFICAÇÃO: ${context.porTier.map((t) => `${t.tier}: ${t.quantidade}${t.receitaRealSomada > 0 ? ` (R$ ${t.receitaRealSomada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})` : ''}`).join(' | ')}

═══════════════════════════════
QUALIDADE DE DADOS
═══════════════════════════════
${formatDataQualitySection(alerts, compromissosAtrasados)}

═══════════════════════════════
TODOS OS NEGÓCIOS ATIVOS
═══════════════════════════════
(EMPRESA | CLASSIF | ETAPA | dias parado | Próx compromisso | Prob | Fecha | R$ | Nota)
${dealsCompact}

═══════════════════════════════
NEGÓCIOS PARADOS (>7 dias)
═══════════════════════════════
${paradosCompact}
${agendaEvents.length > 0 ? `
═══════════════════════════════
AGENDA DE HOJE (Brasília)
═══════════════════════════════
${buildTodayAgendaLines(agendaEvents)}

AGENDA — PRÓXIMOS 7 DIAS
${buildAgendaLines(agendaEvents)}` : ''}

═══════════════════════════════
PRIORIDADE DE FECHAMENTO (TOP 3 — use em 🔥 FECHAR ESTA SEMANA)
═══════════════════════════════
${buildTopClosingCandidates(opps, stageConfig, classif)}

RISCOS PRÉ-CLASSIFICADOS (máx. 3 — use em ⚠️ RISCOS IMEDIATOS)
${buildTopRisks(classif)}

RESUMO CADASTRO (máx. 2 bullets — use em 📋 CADASTRO)
${buildCadastroResumo(alerts)}

═══════════════════════════════
TAREFA: DIAGNÓSTICO EXECUTIVO
═══════════════════════════════
Produza o briefing inicial seguindo EXATAMENTE a estrutura abaixo. Sem saudação, sem introdução, sem repetir listas entre seções. Foco em receita e movimentos no funil — cadastro só em 📋 (máx. 2 bullets).

⏰ HOJE
(Compromissos de hoje com horário, empresa e objetivo comercial da ligação/reunião. Se não houver agenda, diga qual negócio avançado contatar primeiro e por quê.)

🧭 DIAGNÓSTICO EXECUTIVO
(2–3 linhas: índice de saúde, gargalo principal, o que impede fechamento nesta semana. Interprete — não liste todos os negócios.)

🔥 FECHAR ESTA SEMANA
(Exatamente 3 negócios. Use PRIORIDADE DE FECHAMENTO acima. Formato de 3 linhas por negócio — ver regras de formatação. Movimento concreto do playbook; se houver bloqueio de cadastro, cite-o na linha → e siga com ação comercial. NUNCA escreva "nenhum negócio em fechamento".)

⚠️ RISCOS IMEDIATOS
(Máx. 3 riscos. Formato de 2 linhas por item — ver regras de formatação. Negócios avançados sem compromisso, parados >14d ou compromissos atrasados.)

📋 CADASTRO
(Omita se RESUMO CADASTRO = OK. Máx. 2 bullets: o que falta cadastrar e quais 2–3 negócios priorizar — não liste 16 nomes.)

🎯 AÇÕES IMEDIATAS
(3 a 5 bullets — uma ação por linha, verbo imperativo, empresa real e prazo. Ex.: "• Agendar reunião com MERIDIAN até sexta-feira". PROIBIDO juntar ações com ponto e vírgula.)`;
}

// ── Challenge Prompt ─────────────────────────────────────────────────────────

function buildChallengeSituation(
  classif: DealClassification,
  dealsParados: ReturnType<typeof buildDealsParados>,
  resumo: FunnelContext['resumo'],
  health: HealthScore,
): string {
  const lines: string[] = [];

  if (classif.fechar.length > 0) {
    lines.push(
      `FECHAR: ${classif.fechar.length} negócio(s) quente(s) — ${classif.fechar.slice(0, 3).map((c) => c.nome).join(', ')}`,
    );
  }
  if (classif.risco.length > 0) {
    lines.push(
      `RISCO: ${classif.risco.length} em risco — ${classif.risco.slice(0, 3).map((c) => c.nome).join(', ')}`,
    );
  }
  if (dealsParados.length > 0) {
    lines.push(
      `PARADOS: ${dealsParados.length} parado(s) >7d — pior: ${dealsParados.slice(0, 2).map((d) => `${d.nome} (${d.diasSemAtividade}d)`).join(', ')}`,
    );
  }
  if (resumo.total <= 3) {
    lines.push('PIPELINE FINO: poucos deals — priorize prospecção ou reativação.');
  }
  if (health.score < 50) {
    lines.push(`SAÚDE CRÍTICA: índice ${health.score}/100 — movimento urgente no funil.`);
  }

  return lines.length > 0 ? lines.join('\n') : 'Carteira estável — desafio deve empurrar receita na semana.';
}

export function buildChallengePrompt(
  opps: OppRow[],
  context: FunnelContext,
  dealsParados: ReturnType<typeof buildDealsParados>,
  classif: DealClassification,
  health: HealthScore,
  stageConfig: FunnelStageConfig[],
  agendaEvents: AgendaEvent[] = [],
  compromissosAtrasados = 0,
  deadlineLabel: string,
) {
  const fecharNomes = classif.fechar.map((c) => c.nome).join(', ') || 'Nenhum';
  const dealsSection = buildDealsCompact(opps, null, stageConfig);
  const resumo = context.resumo;
  const situation = buildChallengeSituation(classif, dealsParados, resumo, health);

  return `${buildPromptBase(health, stageConfig)}

═══════════════════════════════
RESUMO DO FUNIL
═══════════════════════════════
Total: ${resumo.total} | Ganhos: ${resumo.ganhos} | Perdidos: ${resumo.perdidos} | Conversão: ${resumo.taxaConversao}
${resumo.receitaRealAberta > 0 ? `Receita em aberto: R$ ${resumo.receitaRealAberta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : ''}

═══════════════════════════════
SITUAÇÃO (escolha UM foco)
═══════════════════════════════
${situation}

🔥 Fechar agora: ${fecharNomes}

PRIORIDADE DE FECHAMENTO:
${buildTopClosingCandidates(opps, stageConfig, classif)}

NEGÓCIOS ATIVOS (use nomes reais):
${dealsSection}
${agendaEvents.length > 0 ? `
AGENDA — PRÓXIMOS 7 DIAS:
${buildAgendaLines(agendaEvents)}` : ''}
${compromissosAtrasados > 0 ? `\nCompromissos atrasados: ${compromissosAtrasados}` : ''}

═══════════════════════════════
TAREFA: UM DESAFIO DE VENDAS
═══════════════════════════════
Proponha UM desafio objetivo para aumentar vendas esta semana. Escolha o foco mais impactante com base na SITUAÇÃO (fechar, reativar parados, salvar risco ou prospectar).

REGRAS OBRIGATÓRIAS:
• Responda SOMENTE com as 5 seções abaixo — nada antes, nada depois
• 📌 RESUMO = UMA frase curta (máx. 10 palavras) com verbo NO INFINITIVO — ex: "Agendar 3 reuniões de negociação"
• 📊 MÉTRICA = UMA meta numérica clara (número + unidade mensurável)
• 🎯 DESAFIO = UMA ação objetiva (máx. 2 frases; verbo imperativo; cite empresas reais do funil)
• Sem saudação, sem explicação longa, sem listas extras
• Prazo sugerido: ${deadlineLabel}

FORMATO EXATO:

🏆 DESAFIO

⏰ PRAZO
${deadlineLabel}

📌 RESUMO
[verbo no infinitivo + objetivo — ex: "Agendar 3 reuniões de negociação"]

📊 MÉTRICA
[número + unidade — ex: "3 reuniões agendadas" ou "2 propostas enviadas"]

🎯 DESAFIO
[ação única com verbo imperativo, empresas do funil e prazo interno]`;
}
