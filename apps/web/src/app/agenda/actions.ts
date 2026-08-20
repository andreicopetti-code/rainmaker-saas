'use server';

import { createClient } from '@/lib/supabase/server';
import { normalizeScheduledAt, todayInAppTz } from '@/lib/appointments/datetime';
import type { AppointmentTipo } from '@/components/board/types';
import type { OrgMember } from '@/components/board/types';
import { loadOrgMembers } from '@/lib/org/team-members';

export type CalendarEvent = {
  id: string;
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  done: boolean;
  note: string | null;
  location: string | null;
  is_standalone: boolean;
  opportunity_id: string | null;
  opportunity_title: string | null;
  opportunity_stage: string | null;
  contact_company: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  /** Quem criou o compromisso */
  created_by: string;
  /** Responsável: dono do deal (se vinculado) ou quem criou */
  assignee_id: string;
};

export type CalendarEventInput = {
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  location?: string;
  note?: string;
  opportunity_id?: string | null;
};

export type AgendaPageData = {
  events: CalendarEvent[];
  opportunities: { id: string; label: string }[];
  members: OrgMember[];
  currentUserId: string;
};

type ApptRow = {
  id: string;
  tipo: string;
  title: string;
  scheduled_at: string;
  done: boolean;
  note: string | null;
  location: string | null;
  is_standalone: boolean;
  opportunity_id: string | null;
  created_by: string;
};

type OppInfo = {
  title: string;
  stage: string;
  owner_id: string;
  contactCompany: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appts(supabase: any) { return supabase.from('appointments'); }

async function getOrgAndUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data: org } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (!org) throw new Error('Organização não encontrada');
  return { supabase, user, org };
}

function mapRows(rows: ApptRow[], oppMap: Map<string, OppInfo>): CalendarEvent[] {
  return rows.map((r) => {
    const opp = r.opportunity_id ? oppMap.get(r.opportunity_id) : undefined;
    return {
      id: r.id,
      tipo: r.tipo as AppointmentTipo,
      title: r.title,
      scheduled_at: r.scheduled_at,
      done: r.done,
      note: r.note,
      location: r.location,
      is_standalone: r.is_standalone,
      opportunity_id: r.opportunity_id,
      opportunity_title: opp?.title ?? null,
      opportunity_stage: opp?.stage ?? null,
      contact_company: opp?.contactCompany ?? null,
      contact_name: opp?.contactName ?? null,
      contact_phone: opp?.contactPhone ?? null,
      created_by: r.created_by,
      assignee_id: opp?.owner_id ?? r.created_by,
    };
  });
}

async function loadOppMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oppIds: string[],
): Promise<Map<string, OppInfo>> {
  const oppMap = new Map<string, OppInfo>();
  if (oppIds.length === 0) return oppMap;

  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, title, stage, owner_id, contact:contacts(name, company, phone)')
    .in('id', oppIds);

  for (const o of opps ?? []) {
    const raw = o as unknown as {
      id: string;
      title: string;
      stage: string;
      owner_id: string;
      contact: { name: string; company: string | null; phone: string | null } | null;
    };
    oppMap.set(raw.id, {
      title: raw.title,
      stage: raw.stage,
      owner_id: raw.owner_id,
      contactCompany: raw.contact?.company ?? null,
      contactName: raw.contact?.name ?? null,
      contactPhone: raw.contact?.phone ?? null,
    });
  }
  return oppMap;
}

/** Load all events for the org within a date range + overdue outside the window */
export async function getCalendarEvents(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: org } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (!org) return [];

  const todayStart = `${todayInAppTz()}T00:00:00-03:00`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [rangeRes, overdueRes] = await Promise.all([
    sb
      .from('appointments')
      .select('id, tipo, title, scheduled_at, done, note, location, is_standalone, opportunity_id, created_by')
      .eq('organization_id', org.organization_id)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to)
      .order('scheduled_at', { ascending: true }),
    // Undone appointments before today (may be outside the visible month window)
    sb
      .from('appointments')
      .select('id, tipo, title, scheduled_at, done, note, location, is_standalone, opportunity_id, created_by')
      .eq('organization_id', org.organization_id)
      .eq('done', false)
      .lt('scheduled_at', todayStart)
      .order('scheduled_at', { ascending: true }),
  ]);

  const byId = new Map<string, ApptRow>();
  for (const r of (rangeRes.data ?? []) as ApptRow[]) byId.set(r.id, r);
  for (const r of (overdueRes.data ?? []) as ApptRow[]) byId.set(r.id, r);
  const rows = [...byId.values()];
  if (rows.length === 0) return [];

  const oppIds = [...new Set(
    rows.map((r) => r.opportunity_id).filter(Boolean) as string[],
  )];
  const oppMap = await loadOppMap(supabase, oppIds);
  return mapRows(rows, oppMap);
}

/** Create a new calendar event */
export async function createCalendarEvent(input: CalendarEventInput): Promise<void> {
  const { supabase, user, org } = await getOrgAndUser();
  const { error } = await appts(supabase).insert({
    organization_id: org.organization_id,
    created_by: user.id,
    tipo: input.tipo,
    title: input.title.trim(),
    scheduled_at: normalizeScheduledAt(input.scheduled_at),
    location: input.location?.trim() || null,
    note: input.note?.trim() || null,
    opportunity_id: input.opportunity_id ?? null,
    is_standalone: !input.opportunity_id,
    done: false,
  });
  if (error) throw new Error(error.message);
}

/** Update an existing event */
export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput,
): Promise<void> {
  const { supabase, org } = await getOrgAndUser();
  const { error } = await appts(supabase)
    .update({
      tipo: input.tipo,
      title: input.title.trim(),
      scheduled_at: normalizeScheduledAt(input.scheduled_at),
      location: input.location?.trim() || null,
      note: input.note?.trim() || null,
      opportunity_id: input.opportunity_id ?? null,
      is_standalone: !input.opportunity_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', org.organization_id);
  if (error) throw new Error(error.message);
}

/** Toggle done state */
export async function toggleCalendarEventDone(id: string, done: boolean): Promise<void> {
  const { supabase, org } = await getOrgAndUser();
  await appts(supabase)
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.organization_id);
}

/** Delete an event */
export async function deleteCalendarEvent(id: string): Promise<void> {
  const { supabase, org } = await getOrgAndUser();
  await appts(supabase)
    .delete()
    .eq('id', id)
    .eq('organization_id', org.organization_id);
}

/** Load all active opportunities for the org (to link events to deals) */
export async function getOpportunitiesForSelect(): Promise<
  { id: string; label: string }[]
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: org } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (!org) return [];

  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, title, contact:contacts(name, company)')
    .eq('organization_id', org.organization_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  return (opps ?? []).map((o) => {
    const raw = o as unknown as {
      id: string;
      title: string;
      contact: { name: string; company: string | null } | null;
    };
    const name = raw.contact?.company || raw.contact?.name || raw.title;
    return { id: raw.id, label: name };
  });
}

export async function getAgendaPageData(): Promise<AgendaPageData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: org } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (!org) return null;

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59).toISOString();

  const [events, opportunities, members] = await Promise.all([
    getCalendarEvents(from, to),
    getOpportunitiesForSelect(),
    loadOrgMembers(org.organization_id),
  ]);

  return {
    events,
    opportunities,
    members,
    currentUserId: user.id,
  };
}
