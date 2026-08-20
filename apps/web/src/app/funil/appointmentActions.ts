'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeScheduledAt } from '@/lib/appointments/datetime';
import { assertCanModifyOpportunity } from '@/lib/org/deal-access';
import type { AppointmentInput, AppointmentTipo, NextAppointment } from '@/components/board/types';

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) throw new Error('Organização não encontrada');

  return { supabase, user, org };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appts(supabase: any) { return supabase.from('appointments'); }

type ApptRow = {
  id: string;
  opportunity_id?: string;
  tipo: string;
  title: string;
  scheduled_at: string;
  done: boolean;
  location?: string | null;
  note?: string | null;
};

function toNextAppointment(row: ApptRow): NextAppointment {
  return {
    id: row.id,
    tipo: row.tipo as AppointmentTipo,
    title: row.title,
    scheduled_at: row.scheduled_at,
    done: row.done,
    location: row.location ?? null,
    note: row.note ?? null,
  };
}

async function assertCanModifyAppt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  appointmentId: string,
  orgId: string,
  userId: string,
  role: string,
): Promise<string> {
  const { data, error } = await appts(supabase)
    .select('opportunity_id')
    .eq('id', appointmentId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data?.opportunity_id) throw new Error('Compromisso não encontrado');
  await assertCanModifyOpportunity(supabase, data.opportunity_id, orgId, userId, role);
  return data.opportunity_id as string;
}

async function fetchNextUndoneAppt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opportunityId: string,
  orgId: string,
): Promise<NextAppointment | null> {
  const { data, error } = await appts(supabase)
    .select('id, tipo, title, scheduled_at, done, location, note')
    .eq('opportunity_id', opportunityId)
    .eq('organization_id', orgId)
    .eq('done', false)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toNextAppointment(data as ApptRow) : null;
}

async function bumpOpportunityActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opportunityId: string,
  orgId: string,
) {
  await supabase
    .from('opportunities')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('organization_id', orgId);
}

export async function createAppointment(
  opportunityId: string,
  data: AppointmentInput,
): Promise<NextAppointment> {
  const { supabase, user, org } = await getAuthContext();
  await assertCanModifyOpportunity(
    supabase,
    opportunityId,
    org.organization_id,
    user.id,
    org.role,
  );

  if (!data.title.trim()) throw new Error('Informe o título do compromisso');
  if (!data.scheduled_at) throw new Error('Informe a data/hora do compromisso');

  const { data: row, error } = await appts(supabase)
    .insert({
      opportunity_id: opportunityId,
      organization_id: org.organization_id,
      created_by: user.id,
      tipo: data.tipo,
      title: data.title.trim(),
      scheduled_at: normalizeScheduledAt(data.scheduled_at),
      location: data.location?.trim() || null,
      note: data.note?.trim() || null,
      done: false,
    })
    .select('id, tipo, title, scheduled_at, done, location, note')
    .single();

  if (error) throw new Error(error.message);

  await bumpOpportunityActivity(supabase, opportunityId, org.organization_id);

  revalidatePath('/funil');
  revalidatePath('/agenda');
  return toNextAppointment(row as ApptRow);
}

export async function updateAppointment(
  id: string,
  data: AppointmentInput,
): Promise<NextAppointment> {
  const { supabase, user, org } = await getAuthContext();
  await assertCanModifyAppt(supabase, id, org.organization_id, user.id, org.role);

  const { data: row, error } = await appts(supabase)
    .update({
      tipo: data.tipo,
      title: data.title.trim(),
      scheduled_at: normalizeScheduledAt(data.scheduled_at),
      location: data.location?.trim() || null,
      note: data.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', org.organization_id)
    .select('id, tipo, title, scheduled_at, done, location, note')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
  revalidatePath('/agenda');
  return toNextAppointment(row as ApptRow);
}

export type ToggleAppointmentResult = {
  opportunityId: string;
  next: NextAppointment | null;
  /** ISO timestamp written to the deal when marking done */
  activityAt: string | null;
};

export async function toggleAppointmentDone(
  id: string,
  done: boolean,
): Promise<ToggleAppointmentResult> {
  const { supabase, user, org } = await getAuthContext();
  const opportunityId = await assertCanModifyAppt(
    supabase,
    id,
    org.organization_id,
    user.id,
    org.role,
  );

  const { error } = await appts(supabase)
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);

  let activityAt: string | null = null;
  if (done) {
    activityAt = new Date().toISOString();
    await supabase
      .from('opportunities')
      .update({ updated_at: activityAt })
      .eq('id', opportunityId)
      .eq('organization_id', org.organization_id);
  }

  const next = await fetchNextUndoneAppt(supabase, opportunityId, org.organization_id);

  revalidatePath('/funil');
  revalidatePath('/agenda');
  return { opportunityId, next, activityAt };
}

export async function deleteAppointment(id: string) {
  const { supabase, user, org } = await getAuthContext();
  await assertCanModifyAppt(supabase, id, org.organization_id, user.id, org.role);

  const { error } = await appts(supabase)
    .delete()
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
  revalidatePath('/agenda');
}

export async function getOpportunityAppointments(opportunityId: string) {
  const { supabase } = await getAuthContext();

  const { data, error } = await appts(supabase)
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
