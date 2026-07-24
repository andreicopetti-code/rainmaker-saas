/**
 * Metas de receita (org) — load/compute compartilhado entre Dashboard e RM IA (chip Meta).
 *
 * Tracking: soma de `value` de oportunidades em estágio ganho/fechado cuja
 * `updated_at` cai no mês/ano calendário atual (America/Sao_Paulo).
 * Não há `won_at`/`closed_at` no schema; `updated_at` é o proxy usado no dashboard.
 */

import { APP_TIMEZONE } from '@/lib/appointments/datetime';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { isWonStage } from '@/lib/ceo/stage-utils';

export type OrgRevenueGoals = {
  monthly: number | null;
  annual: number | null;
};

export type GoalPeriodProgress = {
  goal: number | null;
  achieved: number;
  /** null se meta não definida */
  pct: number | null;
  /** meta − realizado; null se meta não definida. Negativo = acima da meta */
  gap: number | null;
  hasGoal: boolean;
};

export type RevenueGoalsProgress = {
  monthly: GoalPeriodProgress;
  annual: GoalPeriodProgress;
};

export type WonOppLike = {
  stage: string;
  value: number | null;
  updated_at?: string | null;
};

/** Partes Y/M/D no fuso America/Sao_Paulo (mês 1–12). */
export function getSaoPauloDateParts(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function spPartsFromIso(iso: string): { year: number; month: number; day: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return getSaoPauloDateParts(d);
}

export function isUpdatedInCurrentMonth(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const ref = spPartsFromIso(iso);
  if (!ref) return false;
  const cur = getSaoPauloDateParts(now);
  return ref.year === cur.year && ref.month === cur.month;
}

export function isUpdatedInCurrentYear(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const ref = spPartsFromIso(iso);
  if (!ref) return false;
  return ref.year === getSaoPauloDateParts(now).year;
}

export function sumWonRevenue(
  opps: WonOppLike[],
  stageConfig: FunnelStageConfig[],
  period: 'month' | 'year',
  now = new Date(),
): number {
  const inPeriod = period === 'month' ? isUpdatedInCurrentMonth : isUpdatedInCurrentYear;
  return opps
    .filter((o) => isWonStage(o.stage, stageConfig) && inPeriod(o.updated_at, now))
    .reduce((sum, o) => sum + (o.value ?? 0), 0);
}

function buildPeriodProgress(goal: number | null, achieved: number): GoalPeriodProgress {
  const hasGoal = goal != null;
  if (!hasGoal) {
    return { goal: null, achieved, pct: null, gap: null, hasGoal: false };
  }
  const g = goal as number;
  let pct: number;
  if (g <= 0) {
    pct = achieved > 0 ? 100 : 0;
  } else {
    pct = Math.round((achieved / g) * 1000) / 10;
  }
  return {
    goal: g,
    achieved,
    pct,
    gap: g - achieved,
    hasGoal: true,
  };
}

export function computeRevenueGoalsProgress(
  goals: OrgRevenueGoals,
  monthlyAchieved: number,
  annualAchieved: number,
): RevenueGoalsProgress {
  return {
    monthly: buildPeriodProgress(goals.monthly, monthlyAchieved),
    annual: buildPeriodProgress(goals.annual, annualAchieved),
  };
}

export function computeRevenueGoalsFromOpps(
  goals: OrgRevenueGoals,
  opps: WonOppLike[],
  stageConfig: FunnelStageConfig[],
  now = new Date(),
): RevenueGoalsProgress {
  return computeRevenueGoalsProgress(
    goals,
    sumWonRevenue(opps, stageConfig, 'month', now),
    sumWonRevenue(opps, stageConfig, 'year', now),
  );
}

/** Aceita "50000", "50.000", "50.000,00", "50000.50". Vazio → null. */
export function parseGoalInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    // 50.000,00 → 50000.00
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Texto curto para injetar no prompt do RM IA (chip Meta / briefing). */
export function formatGoalsForPrompt(progress: RevenueGoalsProgress): string {
  const lines: string[] = [];
  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  const mo = progress.monthly;
  if (mo.hasGoal && mo.goal != null) {
    const gapTxt =
      mo.gap == null
        ? ''
        : mo.gap > 0
          ? ` | Gap: ${fmt(mo.gap)}`
          : mo.gap < 0
            ? ` | Acima da meta: ${fmt(Math.abs(mo.gap))}`
            : ' | Meta batida';
    lines.push(
      `Meta mensal: ${fmt(mo.goal)} | Realizado (ganhos no mês): ${fmt(mo.achieved)} | ${mo.pct ?? 0}%${gapTxt}`,
    );
  } else {
    lines.push(
      `Meta mensal: não definida | Realizado (ganhos no mês): ${fmt(mo.achieved)} — não invente número de meta`,
    );
  }

  const an = progress.annual;
  if (an.hasGoal && an.goal != null) {
    const gapTxt =
      an.gap == null
        ? ''
        : an.gap > 0
          ? ` | Gap: ${fmt(an.gap)}`
          : an.gap < 0
            ? ` | Acima da meta: ${fmt(Math.abs(an.gap))}`
            : ' | Meta batida';
    lines.push(
      `Meta anual: ${fmt(an.goal)} | Realizado (ganhos no ano): ${fmt(an.achieved)} | ${an.pct ?? 0}%${gapTxt}`,
    );
  } else {
    lines.push(
      `Meta anual: não definida | Realizado (ganhos no ano): ${fmt(an.achieved)}`,
    );
  }

  lines.push(
    'Critério: receita confirmada = valor de negócios em estágio Ganho com updated_at no período (America/Sao_Paulo).',
  );
  return lines.join('\n');
}
