'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { loadOrgMembers, memberDisplayName } from '@/lib/org/team-members';
import { parseStageConfig, type FunnelStageConfig } from '@/lib/funnel/stage-config';
import type { DashboardOpp } from '@/lib/dashboard/metrics';
import {
  parseGoalInput,
  type OrgRevenueGoals,
} from '@/lib/goals/revenue-goals';

export type DashboardData = {
  opps: DashboardOpp[];
  stageConfig: FunnelStageConfig[];
  overdueAppointments: number;
  upcomingAppointments: number;
  updatedAt: string;
  goals: OrgRevenueGoals;
  canEditGoals: boolean;
};

export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) return null;

  const orgId = org.organization_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: funnel } = await (supabase as any)
    .from('funnels')
    .select('id, stages, stage_config')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const stageConfig = funnel
    ? parseStageConfig(funnel.stage_config, funnel.stages)
    : parseStageConfig(null);

  const funnelId = funnel?.id ?? '';

  const [{ data: oppRows }, { data: memberRows }, { data: orgGoalsRow }] = await Promise.all([
    funnelId
      ? (() => {
          let q = supabase
            .from('opportunities')
            .select(`
            id, title, stage, value, probability, description, owner_id,
            custom_fields, updated_at, created_at, tags,
            expected_close_date, lost_reason,
            contact:contacts(name, company, custom_fields)
          `)
            .eq('funnel_id', funnelId)
            .eq('organization_id', orgId)
            .is('deleted_at', null);
          if (org.role !== 'admin') {
            q = q.eq('owner_id', user.id);
          }
          return q;
        })()
      : Promise.resolve({ data: [] }),
    supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('is_active', true),
    supabase
      .from('organizations')
      .select('goal_monthly, goal_annual')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const members = await loadOrgMembers(orgId);
  const ownerNames = new Map<string, string>();
  for (const m of members) {
    ownerNames.set(m.user_id, memberDisplayName(m));
  }
  for (const uid of memberIds) {
    if (!ownerNames.has(uid)) ownerNames.set(uid, 'Usuário');
  }

  const oppIds = (oppRows ?? []).map((o) => o.id);
  const now = new Date();
  const plus7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const minus7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const minus30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [apptFutureRes, apptAllRes, overdueRes, upcomingRes] = await Promise.all([
    oppIds.length
      ? sb.from('appointments')
          .select('opportunity_id, scheduled_at, tipo')
          .in('opportunity_id', oppIds)
          .eq('done', false)
          .gte('scheduled_at', now.toISOString())
          .order('scheduled_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ opportunity_id: string; scheduled_at: string; tipo: string }> }),

    oppIds.length
      ? sb.from('appointments')
          .select('opportunity_id, scheduled_at, tipo, done, created_at')
          .in('opportunity_id', oppIds)
      : Promise.resolve({ data: [] as Array<{ opportunity_id: string; scheduled_at: string; tipo: string; done: boolean; created_at: string }> }),

    sb.from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('done', false)
      .lt('scheduled_at', now.toISOString()),

    sb.from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('done', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', plus7d.toISOString()),
  ]);

  type ApptRow = { opportunity_id: string; scheduled_at: string; tipo: string; done: boolean; created_at: string };
  const apptStats = new Map<string, {
    next?: { scheduledAt: string; tipo: string };
    total: number;
    done: number;
    last7: number;
    last30: number;
    demos: number;
  }>();

  for (const a of (apptAllRes.data ?? []) as ApptRow[]) {
    const stats = apptStats.get(a.opportunity_id) ?? { total: 0, done: 0, last7: 0, last30: 0, demos: 0 };
    stats.total += 1;
    if (a.done) stats.done += 1;
    const ref = a.scheduled_at || a.created_at;
    if (ref) {
      const d = new Date(ref);
      if (d >= minus7d) stats.last7 += 1;
      if (d >= minus30d) stats.last30 += 1;
    }
    if (/demo/i.test(a.tipo)) stats.demos += 1;
    apptStats.set(a.opportunity_id, stats);
  }

  const nextApptMap = new Map<string, { scheduledAt: string; tipo: string }>();
  for (const a of (apptFutureRes.data ?? []) as Array<{ opportunity_id: string; scheduled_at: string; tipo: string }>) {
    if (!nextApptMap.has(a.opportunity_id)) {
      nextApptMap.set(a.opportunity_id, { scheduledAt: a.scheduled_at, tipo: a.tipo });
    }
  }

  const opps: DashboardOpp[] = (oppRows ?? []).map((row) => {
    const o = row as unknown as {
      id: string;
      title: string;
      stage: string;
      value: number | null;
      probability: number | null;
      description: string | null;
      owner_id: string;
      custom_fields: Record<string, unknown> | null;
      updated_at: string | null;
      created_at: string | null;
      tags: string[] | null;
      expected_close_date: string | null;
      lost_reason: string | null;
      contact?: { name?: string; company?: string; custom_fields?: { setor?: string; porte?: string } } | null;
    };
    const appt = nextApptMap.get(o.id);
    const stats = apptStats.get(o.id);
    const cf = o.custom_fields;
    return {
      id: o.id,
      title: o.title,
      stage: o.stage,
      value: o.value,
      probability: o.probability,
      description: o.description,
      custom_fields: o.custom_fields,
      updated_at: o.updated_at,
      created_at: o.created_at,
      tags: o.tags,
      expected_close_date: o.expected_close_date,
      lost_reason: o.lost_reason,
      owner_id: o.owner_id,
      owner_name: ownerNames.get(o.owner_id) ?? null,
      lead_source: cf && typeof cf === 'object' && 'lead_source' in cf ? String(cf.lead_source) : null,
      contact_name: o.contact?.name ?? null,
      contact_company: o.contact?.company ?? null,
      contact_setor: o.contact?.custom_fields?.setor ?? null,
      contact_porte: o.contact?.custom_fields?.porte ?? null,
      next_appointment: appt?.scheduledAt ?? null,
      next_appt_tipo: appt?.tipo ?? null,
      appts_7d: stats?.last7 ?? 0,
      appts_30d: stats?.last30 ?? 0,
      appointments_total: stats?.total ?? 0,
      appointments_done: stats?.done ?? 0,
      demos_count: stats?.demos ?? 0,
    };
  });

  const goals: OrgRevenueGoals = {
    monthly: orgGoalsRow?.goal_monthly != null ? Number(orgGoalsRow.goal_monthly) : null,
    annual: orgGoalsRow?.goal_annual != null ? Number(orgGoalsRow.goal_annual) : null,
  };

  return {
    opps,
    stageConfig,
    overdueAppointments: (overdueRes as { count?: number }).count ?? 0,
    upcomingAppointments: (upcomingRes as { count?: number }).count ?? 0,
    updatedAt: new Date().toISOString(),
    goals,
    canEditGoals: org.role === 'admin',
  };
}

export type SaveGoalsResult = { ok: true } | { ok: false; error: string };

/** Persiste metas mensal/anual na organização (admin). Aceita string ou number; vazio → null. */
export async function saveOrgRevenueGoals(input: {
  monthly: string | number | null;
  annual: string | number | null;
}): Promise<SaveGoalsResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Não autenticado' };

    const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
    const org = orgRows?.[0];
    if (!org) return { ok: false, error: 'Organização não encontrada' };
    if (org.role !== 'admin') {
      return { ok: false, error: 'Apenas administradores podem editar as metas' };
    }

    const toGoal = (v: string | number | null): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
      return parseGoalInput(v);
    };

    const goal_monthly = toGoal(input.monthly);
    const goal_annual = toGoal(input.annual);

    const { error } = await supabase
      .from('organizations')
      .update({
        goal_monthly,
        goal_annual,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.organization_id);

    if (error) return { ok: false, error: error.message };

    revalidatePath('/dashboard');
    revalidatePath('/ceo');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar metas' };
  }
}
