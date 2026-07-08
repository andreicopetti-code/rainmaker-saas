'use server';

import { createClient } from '@/lib/supabase/server';
import { normalizeScheduledAt } from '@/lib/appointments/datetime';
import type { AppointmentTipo } from '@/components/board/types';

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
};

export type CalendarEventInput = {
  tipo: AppointmentTipo;
  title: string;
  scheduled_at: string;
  location?: string;
  note?: string;
  opportunity_id?: string | null;
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

/** Load all events for the org within a date range */
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

  // Fetch all appointments for the org within the range
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('appointments')
    .select('id, tipo, title, scheduled_at, done, note, location, is_standalone, opportunity_id')
    .eq('organization_id', org.organization_id)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true });

  if (!rows || rows.length === 0) return [];

  // Get opportunity+contact names for linked deals
  const oppIds = [...new Set(
    (rows as { opportunity_id: string | null }[])
      .map((r) => r.opportunity_id)
      .filter(Boolean) as string[]
  )];

  const oppMap = new Map<string, { title: string; stage: string; contactCompany: string | null; contactName: string | null; contactPhone: string | null }>();
  if (oppIds.length > 0) {
    const { data: opps } = await supabase
      .from('opportunities')
      .select('id, title, stage, contact:contacts(name, company, phone)')
      .in('id', oppIds);
    for (const o of opps ?? []) {
      const raw = o as unknown as {
        id: string;
        title: string;
        stage: string;
        contact: { name: string; company: string | null; phone: string | null } | null;
      };
      oppMap.set(raw.id, {
        title: raw.title,
        stage: raw.stage,
        contactCompany: raw.contact?.company ?? null,
        contactName: raw.contact?.name ?? null,
        contactPhone: raw.contact?.phone ?? null,
      });
    }
  }

  return (rows as {
    id: string; tipo: string; title: string; scheduled_at: string;
    done: boolean; note: string | null; location: string | null;
    is_standalone: boolean; opportunity_id: string | null;
    opportunity_stage?: string | null;
  }[]).map((r) => {
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
    };
  });
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
