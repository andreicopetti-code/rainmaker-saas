import { TIERS } from '@ceo-brain/shared';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { resolveStageId } from '@/lib/funnel/stage-config';
import { buildDealsParados } from '@/lib/ceo/context';
import {
  computeDashboardMetrics,
  filterOppsByPeriod,
  type DashPeriod,
  type DashboardMetrics,
  type DashboardOpp,
} from './metrics';

export type { DashPeriod, DashboardOpp, DashboardMetrics };
export { filterOppsByPeriod, computeDashboardMetrics };

export type VolumeWindow = 30 | 90 | 180;

export type StageAmplitude = {
  id: string;
  label: string;
  color: string;
  count: number;
  pct: number;
  value: number;
  avgValue: number;
};

export type WaterfallStep = {
  label: string;
  count: number;
  drop: number;
  dropPct: number;
  color: string;
};

export type StageVelocity = {
  id: string;
  label: string;
  color: string;
  avgDays: number;
  p25: number;
  p50: number;
  p75: number;
  dealCount: number;
  conversionToNext: number;
  conversionPrevPeriod: number | null;
};

export type SizeBucket = 'pequeno' | 'medio' | 'grande';

export type ForecastScenario = {
  optimistic: number;
  realistic: number;
  pessimistic: number;
  committed: number;
  pipelineBenchmark: number;
};

export type SourceRow = {
  source: string;
  count: number;
  won: number;
  conversion: number;
  avgValue: number;
  pipelineValue: number;
};

export type OwnerRow = {
  ownerId: string;
  name: string;
  dealCount: number;
  activeCount: number;
  pipelineValue: number;
  avgDaysInStage: number;
  winRate: number;
  stalledCount: number;
};

export type RedFlag = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  opportunityId?: string;
};

export type PendingAction = {
  opportunityId: string;
  name: string;
  stage: string;
  nextAction: string;
  responsible: string;
  expectedDate: string | null;
  isLate: boolean;
  daysIdle: number;
};

export type ExtendedDashboardMetrics = DashboardMetrics & {
  amplitude: StageAmplitude[];
  waterfall: WaterfallStep[];
  volumeTrend: { label: string; count: number }[];
  volumeWindow: VolumeWindow;
  velocity: StageVelocity[];
  fullFunnelConversion: number;
  periodComparison: {
    current: { deals: number; won: number; pipeline: number };
    previous: { deals: number; won: number; pipeline: number };
    deltaDeals: number;
    deltaWon: number;
    deltaPipeline: number;
  };
  valueByStage: { label: string; total: number; avg: number; color: string }[];
  sizeDistribution: Record<SizeBucket, number>;
  forecast: ForecastScenario;
  overdueDeals: { id: string; name: string; daysOverdue: number; stage: string; value: number }[];
  lowProbDeals: { id: string; name: string; prob: number; stageProb: number; stage: string }[];
  inactiveDeals: { id: string; name: string; days: number; stage: string; value: number }[];
  engagement: { withTouch7d: number; withTouch30d: number; noTouch30d: number };
  sources: SourceRow[];
  segments: {
    sectors: { name: string; count: number; value: number; winRate: number }[];
    tiers: { id: string; label: string; count: number; value: number }[];
    portes: { name: string; count: number }[];
  };
  owners: OwnerRow[];
  pipelineTrend: { label: string; active: number; entered: number; won: number }[];
  entryExit: { entered: number; won: number; lost: number; net: number };
  benchmarks: {
    pipelineToForecastRatio: number;
    avgCycleDays: number;
    healthyPipelineMultiple: number;
  };
  redFlags: RedFlag[];
  pendingActions: PendingAction[];
  behavior: {
    scheduledAppts: number;
    doneAppts: number;
    completionRate: number;
    demoDeals: number;
  };
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

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

function dealValue(opp: DashboardOpp): number {
  const v = opp.value ?? 0;
  return v > 0 ? v : 0;
}

function isWon(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 100) return true;
  return id === 'GANHO' || id === 'ganho';
}

function isLost(stage: string, config: FunnelStageConfig[]): boolean {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  if (match?.prob === 0 && /perd/i.test(match.label)) return true;
  return id === 'PERDIDO' || id === 'perdido';
}

function isActive(stage: string, config: FunnelStageConfig[]): boolean {
  return !isWon(stage, config) && !isLost(stage, config);
}

function stageProb(stage: string, config: FunnelStageConfig[]): number {
  const id = resolveStageId(stage, config);
  return config.find((s) => s.id === id)?.prob ?? 50;
}

function stageMeta(stage: string, config: FunnelStageConfig[]) {
  const id = resolveStageId(stage, config);
  const match = config.find((s) => s.id === id);
  return {
    id,
    label: match?.label ?? stage,
    color: match?.color ?? '#2563EB',
    prob: match?.prob ?? 50,
  };
}

function sizeBucket(value: number): SizeBucket {
  if (value >= 100_000) return 'grande';
  if (value >= 25_000) return 'medio';
  return 'pequeno';
}

function leadSource(opp: DashboardOpp): string {
  const cf = opp.custom_fields;
  if (cf && typeof cf === 'object' && 'lead_source' in cf && cf.lead_source) {
    return String(cf.lead_source);
  }
  if (opp.tags?.length) return opp.tags[0];
  return 'Não informado';
}

function filterByCreatedDays(opps: DashboardOpp[], days: number): DashboardOpp[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return opps.filter((o) => o.created_at && new Date(o.created_at) >= cutoff);
}

function previousPeriodOpps(opps: DashboardOpp[], period: DashPeriod): DashboardOpp[] {
  if (period === 'all') return [];
  const days = Number(period);
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  const prevStart = new Date(currentStart);
  prevStart.setDate(prevStart.getDate() - days);
  return opps.filter((o) => {
    const ref = o.updated_at ?? o.created_at;
    if (!ref) return false;
    const d = new Date(ref);
    return d >= prevStart && d < currentStart;
  });
}

function buildVolumeTrend(opps: DashboardOpp[], window: VolumeWindow) {
  const buckets: Record<string, number> = {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - window);
  const weekMs = 7 * 86400000;
  const filtered = opps.filter((o) => o.created_at && new Date(o.created_at) >= cutoff);
  filtered.forEach((o) => {
    const d = new Date(o.created_at!);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    buckets[key] = (buckets[key] ?? 0) + 1;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      label: new Date(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      count,
    }));
}

export function computeExtendedDashboardMetrics(
  allOpps: DashboardOpp[],
  periodOpps: DashboardOpp[],
  stageConfig: FunnelStageConfig[],
  overdueAppointments: number,
  upcomingAppointments: number,
  volumeWindow: VolumeWindow = 90,
  period: DashPeriod = 'all',
): ExtendedDashboardMetrics {
  const base = computeDashboardMetrics(
    periodOpps,
    stageConfig,
    overdueAppointments,
    upcomingAppointments,
  );

  const activeAll = allOpps.filter((o) => isActive(o.stage, stageConfig));
  const visibleStages = stageConfig.filter((s) => !s.hidden && !isLost(s.id, stageConfig));

  const amplitude: StageAmplitude[] = visibleStages.map((s) => {
    const deals = allOpps.filter((o) => resolveStageId(o.stage, stageConfig) === s.id);
    const values = deals.map(dealValue).filter((v) => v > 0);
    const value = deals.reduce((sum, o) => sum + dealValue(o), 0);
    return {
      id: s.id,
      label: s.label,
      color: s.color,
      count: deals.length,
      pct: Math.round((deals.length / allOpps.length) * 100) || 0,
      value,
      avgValue: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    };
  });

  const activeStages = visibleStages.filter((s) => !isWon(s.id, stageConfig));
  const waterfall: WaterfallStep[] = activeStages.map((s, idx) => {
    const count = amplitude.find((a) => a.id === s.id)?.count ?? 0;
    const prevCount = idx === 0 ? count : (amplitude.find((a) => a.id === activeStages[idx - 1].id)?.count ?? count);
    const drop = idx === 0 ? 0 : Math.max(0, prevCount - count);
    const dropPct = idx === 0 || prevCount === 0 ? 0 : Math.round((drop / prevCount) * 100);
    return { label: s.label, count, drop, dropPct, color: s.color };
  });

  const volumeTrend = buildVolumeTrend(allOpps, volumeWindow);

  const prevOpps = previousPeriodOpps(allOpps, period);
  const prevActive = prevOpps.filter((o) => isActive(o.stage, stageConfig));
  const prevWon = prevOpps.filter((o) => isWon(o.stage, stageConfig));

  const velocity: StageVelocity[] = activeStages.map((s, idx) => {
    const deals = activeAll.filter((o) => resolveStageId(o.stage, stageConfig) === s.id);
    const days = deals.map((o) => daysAgo(o.updated_at));
    const nextStage = activeStages[idx + 1];
    const nextCount = nextStage
      ? allOpps.filter((o) => resolveStageId(o.stage, stageConfig) === nextStage.id).length
      : 0;
    const conv = deals.length > 0 && nextStage ? Math.round((nextCount / deals.length) * 100) : 0;
    const prevDeals = prevActive.filter((o) => resolveStageId(o.stage, stageConfig) === s.id);
    const prevNext = nextStage
      ? prevOpps.filter((o) => resolveStageId(o.stage, stageConfig) === nextStage.id).length
      : 0;
    const convPrev = prevDeals.length > 0 && nextStage ? Math.round((prevNext / prevDeals.length) * 100) : null;
    return {
      id: s.id,
      label: s.label,
      color: s.color,
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
      p25: percentile(days, 25),
      p50: percentile(days, 50),
      p75: percentile(days, 75),
      dealCount: deals.length,
      conversionToNext: conv,
      conversionPrevPeriod: convPrev,
    };
  });

  const firstStage = activeStages[0];
  const firstCount = firstStage
    ? allOpps.filter((o) => resolveStageId(o.stage, stageConfig) === firstStage.id).length
    : 0;
  const wonCount = allOpps.filter((o) => isWon(o.stage, stageConfig)).length;
  const fullFunnelConversion = firstCount > 0 ? Math.round((wonCount / firstCount) * 100) : 0;

  const currentPipeline = activeAll.reduce((s, o) => s + dealValue(o), 0);
  const prevPipeline = prevActive.reduce((s, o) => s + dealValue(o), 0);

  const valueByStage = amplitude
    .filter((a) => activeStages.some((s) => s.id === a.id))
    .map((a) => ({
      label: a.label,
      total: a.value,
      avg: a.avgValue,
      color: a.color,
    }));

  const sizeDistribution: Record<SizeBucket, number> = { pequeno: 0, medio: 0, grande: 0 };
  activeAll.forEach((o) => {
    sizeDistribution[sizeBucket(dealValue(o))] += 1;
  });

  const weighted = activeAll.reduce((s, o) => s + dealValue(o) * ((o.probability ?? stageProb(o.stage, stageConfig)) / 100), 0);
  const optimistic = activeAll.reduce((s, o) => s + dealValue(o) * Math.max((o.probability ?? stageProb(o.stage, stageConfig)) / 100, 0.7), 0);
  const pessimistic = activeAll.reduce((s, o) => s + dealValue(o) * ((o.probability ?? stageProb(o.stage, stageConfig)) / 100) * 0.5, 0);
  const committed = activeAll
    .filter((o) => stageProb(o.stage, stageConfig) >= 70)
    .reduce((s, o) => s + dealValue(o), 0);

  const forecast: ForecastScenario = {
    optimistic: Math.round(optimistic),
    realistic: Math.round(weighted),
    pessimistic: Math.round(pessimistic),
    committed: Math.round(committed),
    pipelineBenchmark: Math.round(weighted * 3.5),
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const overdueDeals = activeAll
    .filter((o) => o.expected_close_date && new Date(o.expected_close_date) < now)
    .map((o) => ({
      id: o.id,
      name: displayName(o),
      daysOverdue: daysAgo(o.expected_close_date),
      stage: stageMeta(o.stage, stageConfig).label,
      value: dealValue(o),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 10);

  const lowProbDeals = activeAll
    .filter((o) => {
      const prob = o.probability ?? stageProb(o.stage, stageConfig);
      const stageP = stageProb(o.stage, stageConfig);
      return prob < stageP - 15 || prob < 30;
    })
    .map((o) => ({
      id: o.id,
      name: displayName(o),
      prob: o.probability ?? stageProb(o.stage, stageConfig),
      stageProb: stageProb(o.stage, stageConfig),
      stage: stageMeta(o.stage, stageConfig).label,
    }))
    .slice(0, 10);

  const inactiveDeals = activeAll
    .filter((o) => daysAgo(o.updated_at) >= 14)
    .map((o) => ({
      id: o.id,
      name: displayName(o),
      days: daysAgo(o.updated_at),
      stage: stageMeta(o.stage, stageConfig).label,
      value: dealValue(o),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  const withTouch7d = activeAll.filter((o) => (o.appts_7d ?? 0) > 0 || daysAgo(o.updated_at) <= 7).length;
  const withTouch30d = activeAll.filter((o) => (o.appts_30d ?? 0) > 0 || daysAgo(o.updated_at) <= 30).length;

  const sourceMap = new Map<string, DashboardOpp[]>();
  allOpps.forEach((o) => {
    const src = leadSource(o);
    const list = sourceMap.get(src) ?? [];
    list.push(o);
    sourceMap.set(src, list);
  });
  const sources: SourceRow[] = [...sourceMap.entries()]
    .map(([source, deals]) => {
      const won = deals.filter((o) => isWon(o.stage, stageConfig)).length;
      const active = deals.filter((o) => isActive(o.stage, stageConfig));
      const values = deals.map(dealValue).filter((v) => v > 0);
      return {
        source,
        count: deals.length,
        won,
        conversion: deals.length ? Math.round((won / deals.length) * 100) : 0,
        avgValue: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
        pipelineValue: active.reduce((s, o) => s + dealValue(o), 0),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const sectorMap = new Map<string, DashboardOpp[]>();
  allOpps.forEach((o) => {
    const s = o.contact_setor?.trim() || 'Não informado';
    const list = sectorMap.get(s) ?? [];
    list.push(o);
    sectorMap.set(s, list);
  });

  const tierMap = new Map<string, DashboardOpp[]>();
  allOpps.forEach((o) => {
    const cf = o.custom_fields as { tier?: string } | null;
    const t = cf?.tier ?? '—';
    const list = tierMap.get(t) ?? [];
    list.push(o);
    tierMap.set(t, list);
  });

  const porteMap = new Map<string, number>();
  allOpps.forEach((o) => {
    const p = o.contact_porte?.trim() || 'Não informado';
    porteMap.set(p, (porteMap.get(p) ?? 0) + 1);
  });

  const ownerMap = new Map<string, DashboardOpp[]>();
  allOpps.forEach((o) => {
    const id = o.owner_id ?? 'unknown';
    const list = ownerMap.get(id) ?? [];
    list.push(o);
    ownerMap.set(id, list);
  });

  const owners: OwnerRow[] = [...ownerMap.entries()]
    .map(([ownerId, deals]) => {
      const active = deals.filter((o) => isActive(o.stage, stageConfig));
      const won = deals.filter((o) => isWon(o.stage, stageConfig)).length;
      const lost = deals.filter((o) => isLost(o.stage, stageConfig)).length;
      const parados = buildDealsParados(deals, stageConfig, 14).length;
      return {
        ownerId,
        name: deals[0]?.owner_name ?? 'Sem responsável',
        dealCount: deals.length,
        activeCount: active.length,
        pipelineValue: active.reduce((s, o) => s + dealValue(o), 0),
        avgDaysInStage: active.length
          ? Math.round(active.reduce((s, o) => s + daysAgo(o.updated_at), 0) / active.length)
          : 0,
        winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
        stalledCount: parados,
      };
    })
    .sort((a, b) => b.pipelineValue - a.pipelineValue);

  const pipelineTrend = Array.from({ length: 4 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (3 - i));
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const inMonth = allOpps.filter((o) => {
      const ref = o.created_at;
      if (!ref) return false;
      const dt = new Date(ref);
      return dt >= start && dt <= end;
    });
    return {
      label: start.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      active: inMonth.filter((o) => isActive(o.stage, stageConfig)).length,
      entered: inMonth.length,
      won: inMonth.filter((o) => isWon(o.stage, stageConfig)).length,
    };
  });

  const periodDays = period === 'all' ? 90 : Number(period);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  const recent = allOpps.filter((o) => o.created_at && new Date(o.created_at) >= cutoff);
  const entryExit = {
    entered: recent.length,
    won: recent.filter((o) => isWon(o.stage, stageConfig)).length,
    lost: recent.filter((o) => isLost(o.stage, stageConfig)).length,
    net: recent.filter((o) => isWon(o.stage, stageConfig)).length - recent.filter((o) => isLost(o.stage, stageConfig)).length,
  };

  const avgCycleDays = activeAll.length
    ? Math.round(activeAll.reduce((s, o) => s + daysAgo(o.created_at), 0) / activeAll.length)
    : 0;

  const redFlags: RedFlag[] = [];

  amplitude.forEach((a) => {
    if (a.pct >= 35 && !/ganho|perd/i.test(a.label)) {
      redFlags.push({
        id: `bottleneck-${a.id}`,
        severity: 'warning',
        title: `Gargalo em ${a.label}`,
        detail: `${a.pct}% do funil (${a.count} deals) concentrados nesta etapa.`,
      });
    }
  });

  overdueDeals.slice(0, 3).forEach((d) => {
    redFlags.push({
      id: `overdue-${d.id}`,
      severity: 'critical',
      title: `Deal vencido: ${d.name}`,
      detail: `${d.daysOverdue} dias além da data esperada · ${d.stage}`,
      opportunityId: d.id,
    });
  });

  inactiveDeals.filter((d) => d.value >= 50_000).slice(0, 3).forEach((d) => {
    redFlags.push({
      id: `inactive-big-${d.id}`,
      severity: 'critical',
      title: `Grande oportunidade parada: ${d.name}`,
      detail: `${d.days} dias sem atividade · ${formatValue(d.value)}`,
      opportunityId: d.id,
    });
  });

  if (activeAll.length < 5) {
    redFlags.push({
      id: 'pipeline-low',
      severity: 'warning',
      title: 'Pipeline abaixo do mínimo seguro',
      detail: `Apenas ${activeAll.length} deals ativos. Meta sugerida: 3–4× o forecast.`,
    });
  }

  owners.filter((o) => o.activeCount >= 15).forEach((o) => {
    redFlags.push({
      id: `overload-${o.ownerId}`,
      severity: 'info',
      title: `Carteira sobrecarregada: ${o.name}`,
      detail: `${o.activeCount} deals ativos — considere redistribuir.`,
    });
  });

  const pendingActions: PendingAction[] = activeAll
    .map((o) => {
      const idle = daysAgo(o.updated_at);
      const nextAction = o.next_appointment
        ? `Compromisso: ${o.next_appt_tipo ?? 'reunião'}`
        : o.description?.slice(0, 60) || 'Definir próxima ação';
      const expectedDate = o.next_appointment ?? o.expected_close_date ?? null;
      const isLate = expectedDate ? new Date(expectedDate) < now : idle > 14;
      return {
        opportunityId: o.id,
        name: displayName(o),
        stage: stageMeta(o.stage, stageConfig).label,
        nextAction,
        responsible: o.owner_name ?? '—',
        expectedDate,
        isLate,
        daysIdle: idle,
      };
    })
    .sort((a, b) => (b.isLate ? 1 : 0) - (a.isLate ? 1 : 0) || b.daysIdle - a.daysIdle)
    .slice(0, 12);

  const totalAppts = allOpps.reduce((s, o) => s + (o.appointments_total ?? 0), 0);
  const doneAppts = allOpps.reduce((s, o) => s + (o.appointments_done ?? 0), 0);
  const demoDeals = allOpps.filter((o) => (o.demos_count ?? 0) > 0).length;

  return {
    ...base,
    amplitude,
    waterfall,
    volumeTrend,
    volumeWindow,
    velocity,
    fullFunnelConversion,
    periodComparison: {
      current: {
        deals: periodOpps.length,
        won: periodOpps.filter((o) => isWon(o.stage, stageConfig)).length,
        pipeline: currentPipeline,
      },
      previous: {
        deals: prevOpps.length,
        won: prevWon.length,
        pipeline: prevPipeline,
      },
      deltaDeals: periodOpps.length - prevOpps.length,
      deltaWon: periodOpps.filter((o) => isWon(o.stage, stageConfig)).length - prevWon.length,
      deltaPipeline: currentPipeline - prevPipeline,
    },
    valueByStage,
    sizeDistribution,
    forecast,
    overdueDeals,
    lowProbDeals,
    inactiveDeals,
    engagement: {
      withTouch7d,
      withTouch30d,
      noTouch30d: Math.max(0, activeAll.length - withTouch30d),
    },
    sources,
    segments: {
      sectors: [...sectorMap.entries()]
        .map(([name, deals]) => ({
          name,
          count: deals.length,
          value: deals.filter((o) => isActive(o.stage, stageConfig)).reduce((s, o) => s + dealValue(o), 0),
          winRate: deals.length
            ? Math.round((deals.filter((o) => isWon(o.stage, stageConfig)).length / deals.length) * 100)
            : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      tiers: [...tierMap.entries()].map(([id, deals]) => ({
        id,
        label: TIERS.find((t) => t.id === id)?.label ?? id,
        count: deals.length,
        value: deals.reduce((s, o) => s + dealValue(o), 0),
      })),
      portes: [...porteMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    },
    owners,
    pipelineTrend,
    entryExit,
    benchmarks: {
      pipelineToForecastRatio: weighted > 0 ? Math.round((currentPipeline / weighted) * 10) / 10 : 0,
      avgCycleDays,
      healthyPipelineMultiple: 3.5,
    },
    redFlags: redFlags.slice(0, 12),
    pendingActions,
    behavior: {
      scheduledAppts: totalAppts,
      doneAppts,
      completionRate: totalAppts > 0 ? Math.round((doneAppts / totalAppts) * 100) : 0,
      demoDeals,
    },
  };
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`;
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

export { filterByCreatedDays };
