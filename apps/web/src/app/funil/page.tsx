import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import type { ContactData, NextAppointment, OrgMember, OpportunityCustomFields, OpportunityItem } from '@/components/board/types';
import { isOrgAdmin } from '@/lib/org/deal-access';
import { loadOrgMembers } from '@/lib/org/team-members';
import { createClient } from '@/lib/supabase/server';
import { parseStageConfig } from '@/lib/funnel/stage-config';

function parseCustomFields(raw: unknown): OpportunityCustomFields | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as OpportunityCustomFields;
}

function parseContactFields(raw: unknown): ContactData['custom_fields'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ContactData['custom_fields'];
}

export default async function FunilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ── Round 1: org + user context (parallel) ──────────────────────────────
  const [{ data: orgRows }] = await Promise.all([
    supabase.rpc('get_user_organization', { p_user_id: user.id }),
  ]);
  const org = orgRows?.[0];

  const { data: orgRow } = org
    ? await supabase.from('organizations').select('name').eq('id', org.organization_id).single()
    : { data: null };
  const organizationName = orgRow?.name ?? 'Organização';

  // ── Round 2: funnel + members (parallel, both need org) ─────────────────
  const [{ data: funnels }, members] = await Promise.all([
    org
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('funnels')
          .select('id, name, stages, stage_config, organization_id')
          .eq('organization_id', org.organization_id)
          .is('deleted_at', null)
          .limit(1)
      : Promise.resolve({ data: null }),
    org ? loadOrgMembers(org.organization_id) : Promise.resolve([] as OrgMember[]),
  ]);

  const funnel = funnels?.[0] as {
    id: string;
    name: string;
    stages: string[];
    stage_config?: unknown;
    organization_id: string;
  } | undefined;
  const stageConfig = funnel
    ? parseStageConfig(funnel.stage_config, funnel.stages)
    : [];
  const viewerIsAdmin = isOrgAdmin(org?.role);

  // ── Round 3: opportunities + next appointments ───────────────────────────
  let oppQuery = funnel
    ? supabase
        .from('opportunities')
        .select(`
          id, title, stage, value, probability, description,
          owner_id, contact_id, tags, expected_close_date, lost_reason,
          custom_fields, updated_at, sort_order,
          contact:contacts(id, name, company, cnpj, email, phone, position, custom_fields)
        `)
        .eq('funnel_id', funnel.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false })
    : null;

  if (oppQuery && !viewerIsAdmin) {
    oppQuery = oppQuery.eq('owner_id', user.id);
  }

  const [{ data: rows }] = await Promise.all([
    oppQuery ?? Promise.resolve({ data: null }),
  ]);

  // ── Round 4: next appointments (needs oppIds from round 3) ───────────────
  const oppIds = (rows ?? []).map((r) => (r as unknown as { id: string }).id);
  type ApptRow = { opportunity_id: string; id: string; tipo: string; title: string; scheduled_at: string; done: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nextApptRows } = oppIds.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as unknown as any).from('appointments')
        .select('opportunity_id, id, tipo, title, scheduled_at, done')
        .in('opportunity_id', oppIds)
        .eq('done', false)
        .order('scheduled_at', { ascending: true })
    : { data: [] as ApptRow[] };

  const nextApptMap = new Map<string, NextAppointment>();
  for (const a of (nextApptRows ?? []) as ApptRow[]) {
    if (!nextApptMap.has(a.opportunity_id)) {
      nextApptMap.set(a.opportunity_id, {
        id: a.id,
        tipo: a.tipo as NextAppointment['tipo'],
        title: a.title,
        scheduled_at: a.scheduled_at,
        done: a.done,
      });
    }
  }

  // Supabase infers custom_fields as Json — cast to unknown first
  const opportunities: OpportunityItem[] = (rows ?? []).map((r) => {
    const row = r as unknown as {
      id: string; title: string; stage: string; value: number | null;
      probability: number | null; description: string | null; owner_id: string;
      contact_id: string | null; tags: string[] | null; expected_close_date: string | null;
    lost_reason: string | null; custom_fields: OpportunityCustomFields | null;
    updated_at: string | null; sort_order: number | null;
      contact?: { id: string; name: string; company?: string; cnpj?: string; email?: string; phone?: string; position?: string; custom_fields?: ContactData['custom_fields'] } | null;
    };
    return ({
    id: row.id,
    title: row.title,
    stage: row.stage,
    value: row.value,
    probability: row.probability,
    description: row.description,
    owner_id: row.owner_id,
    contact_id: row.contact_id,
    tags: row.tags,
    expected_close_date: row.expected_close_date,
    lost_reason: row.lost_reason,
    custom_fields: parseCustomFields(row.custom_fields),
    updated_at: row.updated_at,
    sort_order: row.sort_order,
    next_appointment: nextApptMap.get(row.id) ?? null,
    contact: row.contact
      ? {
          id: row.contact.id,
          name: row.contact.name,
          company: row.contact.company,
          cnpj: row.contact.cnpj,
          email: row.contact.email,
          phone: row.contact.phone,
          position: row.contact.position,
          custom_fields: parseContactFields(row.contact.custom_fields),
        }
      : null,
    });
  });

  return (
    <div className="board-page">
      {!funnel ? (
        <div style={{ padding: 32, fontSize: 14, color: 'var(--amber)', background: 'var(--amber-bg)', margin: 20, borderRadius: 12 }}>
          Nenhum funil encontrado para sua organização.
        </div>
      ) : (
        <Suspense fallback={null}>
          <KanbanBoard
            funnel={{
              id: funnel.id,
              name: funnel.name,
              stages: funnel.stages,
              stageConfig,
              organizationId: funnel.organization_id,
            }}
            opportunities={opportunities}
            userRole={org?.role ?? 'member'}
            members={members}
            currentUserId={user.id}
            organizationName={organizationName}
          />
        </Suspense>
      )}
    </div>
  );
}
