'use server';

import { createClient } from '@/lib/supabase/server';
import { parseStageConfig } from '@/lib/funnel/stage-config';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { getOrgPlanContext } from '@/lib/billing/org-plan-limits';
import {
  buildFunnelContext,
  buildDealsParados,
  classifyDeals,
  calcHealthScore,
  buildSystemPrompt,
  buildBriefingPrompt,
  buildChallengePrompt,
  type OppRow,
  type AgendaEvent,
  type ChipFocus,
  type FunnelContext,
  type DealClassification,
  type HealthScore,
} from '@/lib/ceo/context';

import { suggestChallengeDeadlineLabel } from '@/lib/ceo/challenge';
import { buildDealLinks, groundAiResponse, type DealLink } from '@/lib/ceo/deal-links';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type CeoAskMode = 'chat' | 'briefing' | 'challenge';

/** Provedores de IA suportados pelo proxy-ai. Default: Groq (não confundir com xAI Grok). */
export type AiProvider = 'deepseek' | 'groq';

export type AskResult =
  | {
      content: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
      aiUsed: number;
      aiLimit: number;
    }
  | { error: string };

function parseRetrySeconds(message: string): number | null {
  const match = message.match(/try again in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1])) + 1;
}

/** Mensagens amigáveis — nunca expor provedor (Groq) ou detalhes técnicos ao usuário. */
function toUserFacingAiError(raw: string): string {
  const msg = raw.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('tokens per minute') || msg.includes('tpm')) {
    return 'Estamos com alto volume de análises no momento. Aguarde cerca de 1 minuto e tente novamente.';
  }
  if (msg.includes('groq') || msg.includes('proxy-ai') || msg.includes('groq_api_key')) {
    return 'O RainMaker IA está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  if (msg.includes('quota') || msg.includes('limit_reached')) {
    return 'Você atingiu o limite de consultas de IA do seu plano neste mês.';
  }
  if (msg.includes('sessão') || msg.includes('session') || msg.includes('autenticado')) {
    return 'Sua sessão expirou. Faça login novamente para continuar.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('conexão') || msg.includes('conectar')) {
    return 'Não foi possível conectar ao RainMaker IA. Verifique sua internet e tente novamente.';
  }

  return 'Não foi possível gerar a resposta agora. Tente novamente em instantes.';
}

async function callProxyAi(
  functionUrl: string,
  token: string,
  messages: ChatMessage[],
  maxAttempts = 3,
  temperature = 0.4,
  opts: { provider?: 'groq' | 'deepseek'; model?: string } = {},
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          messages,
          temperature,
          provider: opts.provider,
          model: opts.model,
        }),
      });
    } catch {
      return {
        ok: false,
        error: toUserFacingAiError('conexão'),
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.ok) {
      return { ok: true, data };
    }

    const msg = typeof data?.error === 'string' ? data.error : `Erro ${res.status}`;
    lastRaw = msg;

    if (msg.includes('GROQ_API_KEY') || msg.includes('DEEPSEEK_API_KEY')) {
      return { ok: false, error: toUserFacingAiError('groq_api_key') };
    }

    const isRateLimit =
      res.status === 429 ||
      data?.rate_limited === true ||
      /rate[_\s-]?limit|tokens per minute|\btpm\b/i.test(msg);

    if (isRateLimit && attempt < maxAttempts) {
      const retrySec = parseRetrySeconds(msg) ?? attempt * 5;
      await new Promise((resolve) => setTimeout(resolve, retrySec * 1000));
      continue;
    }

    return { ok: false, error: toUserFacingAiError(msg) };
  }

  return { ok: false, error: toUserFacingAiError(lastRaw || 'erro desconhecido') };
}

/** Remove briefing do histórico para a IA não copiar o formato em chips/perguntas. */
function trimChatHistory(history: ChatMessage[]): ChatMessage[] {
  return history.filter((m) => {
    if (m.role !== 'assistant') return true;
    const c = m.content;
    return !(c.includes('⏰ HOJE') && c.includes('🧭 DIAGNÓSTICO'));
  });
}

export type CeoPageData = {
  orgId: string;
  context: FunnelContext;
  classif: DealClassification;
  health: HealthScore;
  deals: DealLink[];
  planName: string;
  aiUsed: number;
  aiLimit: number;
  quotaExceeded: boolean;
  ceoBrainEnabled: boolean;
};

// ── Auth + Data Loader ─────────────────────────────────────────────────────────

async function loadCeoData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  const orgId: string = org.organization_id;

  const [{ data: funnelRows }, planCtx] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('funnels')
      .select('id, stages, stage_config')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .limit(1),
    getOrgPlanContext(supabase, orgId),
  ]);

  const funnelId = (funnelRows as Array<{ id: string }> | null)?.[0]?.id ?? '';

  const { data: oppRows } = funnelId
    ? await (async () => {
        let q = supabase
          .from('opportunities')
          .select(`
          id, title, stage, value, probability, description,
          custom_fields, updated_at, tags, expected_close_date, lost_reason,
          contact:contacts(name, company, custom_fields)
        `)
          .eq('funnel_id', funnelId)
          .is('deleted_at', null);
        if (org.role !== 'admin') {
          q = q.eq('owner_id', user.id);
        }
        return q;
      })()
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawOpps = (oppRows ?? []) as unknown as Array<Record<string, any>>;
  const oppIds: string[] = rawOpps.map((o) => o.id as string);

  const now    = new Date();
  const plus7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch future appointments per deal (for next_appointment + tipo)
  // and agenda events for the next 7 days + overdue count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as unknown as any;

  const [apptFutureRes, agendaRes, overdueRes] = await Promise.all([
    oppIds.length
      ? sb.from('appointments')
          .select('opportunity_id, scheduled_at, tipo')
          .in('opportunity_id', oppIds)
          .eq('done', false)
          .gte('scheduled_at', now.toISOString())
          .order('scheduled_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ opportunity_id: string; scheduled_at: string; tipo: string }> }),

    // Agenda próximos 7 dias — all appointments (standalone + linked), with deal info
    sb.from('appointments')
      .select('title, tipo, scheduled_at, opportunity_id, opportunities(title, stage)')
      .eq('organization_id', orgId)
      .eq('done', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', plus7d.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),

    // Overdue appointments count
    sb.from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('done', false)
      .lt('scheduled_at', now.toISOString()),
  ]);

  // Map next appointment per opportunity
  const nextApptMap = new Map<string, { scheduledAt: string; tipo: string }>();
  for (const a of (apptFutureRes.data ?? []) as Array<{ opportunity_id: string; scheduled_at: string; tipo: string }>) {
    if (!nextApptMap.has(a.opportunity_id)) {
      nextApptMap.set(a.opportunity_id, { scheduledAt: a.scheduled_at, tipo: a.tipo });
    }
  }

  // Build agenda events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agendaEvents: AgendaEvent[] = ((agendaRes.data ?? []) as Array<Record<string, any>>).map((a) => ({
    titulo:    a.title ?? '(sem título)',
    tipo:      a.tipo ?? 'compromisso',
    scheduledAt: a.scheduled_at,
    dealNome:  a.opportunities?.title ?? null,
    dealEtapa: a.opportunities?.stage ?? null,
  }));

  const compromissosAtrasados: number = (overdueRes as { count?: number }).count ?? 0;

  const funnelRow = (funnelRows as Array<{ id: string; stages?: string[]; stage_config?: unknown }> | null)?.[0];
  const stageConfig: FunnelStageConfig[] = funnelRow
    ? parseStageConfig(funnelRow.stage_config, funnelRow.stages ?? [])
    : parseStageConfig(null);

  const opps: OppRow[] = rawOpps.map((o) => {
    const appt = nextApptMap.get(o.id as string);
    return {
      id:                 o.id,
      title:              o.title,
      stage:              o.stage,
      value:              o.value,
      probability:        o.probability,
      description:        o.description,
      custom_fields:      o.custom_fields,
      updated_at:         o.updated_at,
      tags:               o.tags,
      expected_close_date: o.expected_close_date,
      lost_reason:        o.lost_reason ?? null,
      contact_name:       (o.contact as { name?: string } | null)?.name ?? null,
      contact_company:    (o.contact as { company?: string } | null)?.company ?? null,
      contact_setor:      (o.contact as { custom_fields?: { setor?: string } } | null)?.custom_fields?.setor ?? null,
      next_appointment:   appt?.scheduledAt ?? null,
      next_appt_tipo:     appt?.tipo ?? null,
    };
  });

  const periodKey = new Date().toISOString().slice(0, 7);
  const { data: counterRow } = await supabase
    .from('usage_counters')
    .select('count')
    .eq('organization_id', orgId)
    .eq('kind', 'ai_request')
    .eq('period_key', periodKey)
    .maybeSingle();

  const aiUsed = counterRow?.count ?? 0;
  const aiLimit = planCtx.limits.ai_monthly;

  return {
    supabase,
    user,
    orgId,
    opps,
    stageConfig,
    planName: planCtx.planName,
    aiUsed,
    aiLimit,
    ceoBrainEnabled: planCtx.limits.ceo_brain_enabled,
    agendaEvents,
    compromissosAtrasados,
  };
}

// ── Page Data (called from server component) ───────────────────────────────────

export async function getCeoPageData(): Promise<CeoPageData | { error: string }> {
  try {
    const { opps, stageConfig, planName, aiUsed, aiLimit, ceoBrainEnabled, orgId } = await loadCeoData();

    const context = buildFunnelContext(opps, stageConfig);
    const classif = classifyDeals(opps, stageConfig);
    const health  = calcHealthScore(opps, context, stageConfig);

    return {
      orgId,
      context,
      classif,
      health,
      deals: buildDealLinks(opps),
      planName,
      aiUsed,
      aiLimit,
      quotaExceeded: aiUsed >= aiLimit,
      ceoBrainEnabled,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro desconhecido';
    return { error: toUserFacingAiError(raw) };
  }
}

// ── Main Server Action ─────────────────────────────────────────────────────────

export async function askCeo(
  history: ChatMessage[],
  mode: CeoAskMode = 'chat',
  chipFocus: ChipFocus = null,
  provider: AiProvider = 'groq',
): Promise<AskResult> {
  try {
    const {
      supabase,
      user,
      orgId,
      opps,
      stageConfig,
      aiUsed,
      aiLimit,
      ceoBrainEnabled,
      agendaEvents,
      compromissosAtrasados,
    } = await loadCeoData();

    if (!ceoBrainEnabled) {
      return { error: 'RainMaker IA não está incluído no seu plano. Faça upgrade para usar.' };
    }

    if (aiUsed >= aiLimit) {
      return {
        error: `Você atingiu o limite de ${aiLimit} consultas de IA deste mês. Faça upgrade do plano para continuar.`,
      };
    }

    const context      = buildFunnelContext(opps, stageConfig);
    const dealsParados = buildDealsParados(opps, stageConfig);
    const classif      = classifyDeals(opps, stageConfig);
    const health       = calcHealthScore(opps, context, stageConfig);

    const deadlineLabel = suggestChallengeDeadlineLabel();

    const systemContent =
      mode === 'briefing'
        ? buildBriefingPrompt(opps, context, dealsParados, classif, health, stageConfig, agendaEvents, compromissosAtrasados)
        : mode === 'challenge'
          ? buildChallengePrompt(opps, context, dealsParados, classif, health, stageConfig, agendaEvents, compromissosAtrasados, deadlineLabel)
          : buildSystemPrompt(opps, context, dealsParados, classif, health, stageConfig, agendaEvents, compromissosAtrasados, chipFocus);

    const chatHistory = mode === 'chat' ? trimChatHistory(history) : history;

    const messages: ChatMessage[] =
      chatHistory.length === 0
        ? [{ role: 'system', content: systemContent }]
        : [{ role: 'system', content: systemContent }, ...chatHistory];

    const finalMessages: ChatMessage[] =
      mode === 'briefing' || mode === 'challenge'
        ? [{ role: 'user', content: systemContent }]
        : messages;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) return { error: 'Sessão expirada. Faça login novamente.' };

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/proxy-ai`;
    const temperature =
      mode === 'briefing'
        ? 0.25
        : mode === 'challenge'
          ? 0.3
          : chipFocus
            ? 0.3
            : 0.35;
    const resolvedProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'groq';
    const model =
      resolvedProvider === 'deepseek' ? 'deepseek-v4-flash' : 'openai/gpt-oss-120b';
    const proxyResult = await callProxyAi(functionUrl, token, finalMessages, 3, temperature, {
      provider: resolvedProvider,
      model,
    });

    if (!proxyResult.ok) {
      return { error: proxyResult.error };
    }

    const data = proxyResult.data;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const rawContent: string = choices?.[0]?.message?.content ?? 'Sem resposta.';
    const content = groundAiResponse(rawContent, buildDealLinks(opps));
    const usage = data.usage as { prompt_tokens: number; completion_tokens: number } | undefined;
    const usedModel =
      (typeof data.model === 'string' && data.model) || model;

    await supabase.from('ai_requests').insert({
      organization_id: orgId,
      user_id: user.id,
      model: usedModel,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
    });

    const periodKey = new Date().toISOString().slice(0, 7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('increment_usage_counter', {
      p_org_id: orgId,
      p_kind: 'ai_request',
      p_period_key: periodKey,
    });

    return {
      content,
      usage,
      aiUsed: aiUsed + 1,
      aiLimit,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro desconhecido';
    return { error: toUserFacingAiError(raw) };
  }
}
