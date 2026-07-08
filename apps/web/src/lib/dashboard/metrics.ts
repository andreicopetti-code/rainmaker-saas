import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { resolveStageId } from '@/lib/funnel/stage-config';
import {
  buildDealsParados,
  buildFunnelContext,
  calcHealthScore,
  classifyDeals,
  type OppRow,
} from '@/lib/ceo/context';

export type DashPeriod = 'all' | '7' | '30' | '90' | '180';

export type DashboardOpp = OppRow & {
  lost_reason?: string | null;
  created_at?: string | null;
  owner_id?: string;
  owner_name?: string | null;
  lead_source?: string | null;
  contact_porte?: string | null;
  appts_7d?: number;
  appts_30d?: number;
  appointments_total?: number;
  appointments_done?: number;
  demos_count?: number;
};

const WIN_IDS = new Set(['GANHO', 'ganho']);
const LOSS_IDS = new Set(['PERDIDO', 'perdido']);

function daysAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

function displayName(opp: DashboardOpp): string {
  return opp.contact_company || opp.contact_name || opp.title;
}

function isWon(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 100) return true;
  return WIN_IDS.has(id) || WIN_IDS.has(stage);
}

function isLost(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 0 && /perd/i.test(match.label)) return true;
  return LOSS_IDS.has(id) || LOSS_IDS.has(stage);
}

function isActive(stage: string, config: FunnelStageConfig[]): boolean {
  return !isWon(stage, config) && !isLost(stage, config);
}

function stageProb(stage: string, config: FunnelStageConfig[]): number {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  return match?.prob ?? 50;
}

function stageMeta(stage: string, config: FunnelStageConfig[]) {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  return {
    id,
    label: match?.label ?? stage,
    color: match?.color ?? '#2563EB',
    bg: match?.bg ?? '#EFF6FF',
    prob: match?.prob ?? 50,
  };
}

export function filterOppsByPeriod(opps: DashboardOpp[], period: DashPeriod): DashboardOpp[] {
  if (period === 'all') return opps;
  const days = Number(period);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return opps.filter((o) => {
    const ref = o.updated_at ?? o.created_at;
    if (!ref) return true;
    return new Date(ref) >= cutoff;
  });
}

export type DashboardKpis = {
  totalDeals: number;
  activeCount: number;
  wonCount: number;
  lostCount: number;
  pipelineValue: number;
  forecastWeighted: number;
  winRate: number;
  confirmedRevenue: number;
  avgTicket: number;
  avgDaysInStage: number;
  stalledCount: number;
  overdueAppointments: number;
  upcomingAppointments: number;
};

export type StageRow = {
  id: string;
  label: string;
  color: string;
  count: number;
  value: number;
  conversionRate: number;
};

export type ActionItem = {
  opportunityId: string;
  name: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  kind: 'stalled' | 'close' | 'risk' | 'overdue';
};

export type DashboardMetrics = {
  kpis: DashboardKpis;
  health: ReturnType<typeof calcHealthScore>;
  classif: ReturnType<typeof classifyDeals>;
  stages: StageRow[];
  monthlyRevenue: { key: string; label: string; value: number; isCurrent: boolean }[];
  lossReasons: { reason: string; count: number }[];
  sectors: { name: string; count: number; pct: number }[];
  topDeals: { id: string; name: string; value: number; stage: string }[];
  stalledDeals: { id: string; name: string; days: number; stage: string }[];
  priorityActions: ActionItem[];
};

export function computeDashboardMetrics(
  opps: DashboardOpp[],
  stageConfig: FunnelStageConfig[],
  overdueAppointments: number,
  upcomingAppointments: number,
): DashboardMetrics {
  const active = opps.filter((o) => isActive(o.stage, stageConfig));
  const won = opps.filter((o) => isWon(o.stage, stageConfig));
  const lost = opps.filter((o) => isLost(o.stage, stageConfig));

  const pipelineValue = active.reduce((s, o) => s + ((o.value ?? 0) > 0 ? (o.value ?? 0) : 0), 0);

  const forecastWeighted = active.reduce((s, o) => {
    const base = (o.value ?? 0) > 0 ? (o.value ?? 0) : 0;
    const prob = o.probability ?? stageProb(o.stage, stageConfig);
    return s + base * (prob / 100);
  }, 0);

  const confirmedRevenue = won.reduce((s, o) => s + (o.value ?? 0), 0);
  const wonWithValue = won.filter((o) => (o.value ?? 0) > 0);
  const avgTicket = wonWithValue.length
    ? wonWithValue.reduce((s, o) => s + (o.value ?? 0), 0) / wonWithValue.length
    : 0;

  const decisivos = won.length + lost.length;
  const winRate = decisivos > 0 ? (won.length / decisivos) * 100 : 0;

  const avgDaysInStage = active.length
    ? Math.round(active.reduce((s, o) => s + daysAgo(o.updated_at), 0) / active.length)
    : 0;

  const parados = buildDealsParados(opps, stageConfig, 14);
  const stalledCount = parados.length;

  const context = buildFunnelContext(opps, stageConfig);
  const classif = classifyDeals(opps, stageConfig);
  const health = calcHealthScore(opps, context, stageConfig);

  const stageRows: StageRow[] = stageConfig
    .filter((s) => !s.hidden)
    .map((s, idx, arr) => {
      const deals = opps.filter((o) => resolveStageId(o.stage, stageConfig) === s.id);
      const value = deals.reduce((sum, o) => sum + (o.value ?? 0), 0);
      const prevStage = arr.slice(0, idx).reverse().find((x) => !isLost(x.id, stageConfig) && !isWon(x.id, stageConfig));
      const prevCount = prevStage
        ? opps.filter((o) => resolveStageId(o.stage, stageConfig) === prevStage.id).length
        : deals.length;
      const conversionRate =
        isLost(s.id, stageConfig) || isWon(s.id, stageConfig)
          ? 0
          : prevCount > 0
            ? Math.round((deals.length / prevCount) * 100)
            : deals.length > 0
              ? 100
              : 0;
      return {
        id: s.id,
        label: s.label,
        color: s.color,
        count: deals.length,
        value,
        conversionRate,
      };
    });

  const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const monthMap: Record<string, number> = {};
  won.forEach((o) => {
    const ref = o.updated_at;
    if (!ref) return;
    const d = new Date(ref);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = (monthMap[key] ?? 0) + (o.value ?? 0);
  });
  const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      label: monthLabels[d.getMonth()],
      value: monthMap[key] ?? 0,
      isCurrent: i === 5,
    };
  });

  const lossMap: Record<string, number> = {};
  lost.forEach((o) => {
    const r = o.lost_reason?.trim() || 'Não informado';
    lossMap[r] = (lossMap[r] ?? 0) + 1;
  });
  const lossReasons = Object.entries(lossMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const sectorMap: Record<string, number> = {};
  opps.forEach((o) => {
    const s = o.contact_setor?.trim() || 'Não informado';
    sectorMap[s] = (sectorMap[s] ?? 0) + 1;
  });
  const totalForSector = opps.length || 1;
  const sectors = Object.entries(sectorMap)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalForSector) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topDeals = [...active]
    .filter((o) => (o.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      name: displayName(o),
      value: o.value ?? 0,
      stage: stageMeta(o.stage, stageConfig).label,
    }));

  const stalledDeals = parados.slice(0, 8).map((p) => {
    const opp = opps.find((o) => displayName(o) === p.nome);
    return {
      id: opp?.id ?? '',
      name: p.nome,
      days: p.diasSemAtividade,
      stage: p.etapa,
    };
  }).filter((d) => d.id);

  const priorityActions: ActionItem[] = [];

  classif.fechar.slice(0, 3).forEach((c) => {
    const opp = opps.find((o) => displayName(o) === c.nome && isActive(o.stage, stageConfig));
    if (!opp) return;
    priorityActions.push({
      opportunityId: opp.id,
      name: c.nome,
      subtitle: `${c.etapa} · ${c.tier}`,
      urgency: 'high',
      kind: 'close',
    });
  });

  classif.risco.slice(0, 3).forEach((c) => {
    const opp = opps.find((o) => displayName(o) === c.nome);
    if (!opp || priorityActions.some((a) => a.opportunityId === opp.id)) return;
    priorityActions.push({
      opportunityId: opp.id,
      name: c.nome,
      subtitle: `${c.etapa} · em risco`,
      urgency: 'medium',
      kind: 'risk',
    });
  });

  stalledDeals.slice(0, 4).forEach((d) => {
    if (priorityActions.some((a) => a.opportunityId === d.id)) return;
    priorityActions.push({
      opportunityId: d.id,
      name: d.name,
      subtitle: `${d.days} dias sem atividade · ${d.stage}`,
      urgency: d.days >= 21 ? 'high' : 'medium',
      kind: 'stalled',
    });
  });

  if (overdueAppointments > 0 && priorityActions.length < 6) {
    priorityActions.push({
      opportunityId: '',
      name: `${overdueAppointments} compromisso${overdueAppointments !== 1 ? 's' : ''} atrasado${overdueAppointments !== 1 ? 's' : ''}`,
      subtitle: 'Revise a agenda e reagende ou conclua',
      urgency: 'high',
      kind: 'overdue',
    });
  }

  return {
    kpis: {
      totalDeals: opps.length,
      activeCount: active.length,
      wonCount: won.length,
      lostCount: lost.length,
      pipelineValue,
      forecastWeighted,
      winRate,
      confirmedRevenue,
      avgTicket,
      avgDaysInStage,
      stalledCount,
      overdueAppointments,
      upcomingAppointments,
    },
    health,
    classif,
    stages: stageRows,
    monthlyRevenue,
    lossReasons,
    sectors,
    topDeals,
    stalledDeals,
    priorityActions: priorityActions.slice(0, 6),
  };
}
