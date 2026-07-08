'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeScheduledAt } from '@/lib/appointments/datetime';
import type { AppointmentInput } from '@/components/board/types';

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

export async function createAppointment(opportunityId: string, data: AppointmentInput) {
  const { supabase, user, org } = await getAuthContext();

  if (!data.title.trim()) throw new Error('Informe o título do compromisso');
  if (!data.scheduled_at) throw new Error('Informe a data/hora do compromisso');

  const { error } = await appts(supabase).insert({
    opportunity_id: opportunityId,
    organization_id: org.organization_id,
    created_by: user.id,
    tipo: data.tipo,
    title: data.title.trim(),
    scheduled_at: normalizeScheduledAt(data.scheduled_at),
    location: data.location?.trim() || null,
    note: data.note?.trim() || null,
    done: false,
  });

  if (error) throw new Error(error.message);

  // atualiza updated_at do deal para não ficar "parado"
  await supabase
    .from('opportunities')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('organization_id', org.organization_id);

  revalidatePath('/funil');
}

export async function updateAppointment(id: string, data: AppointmentInput) {
  const { supabase, org } = await getAuthContext();

  const { error } = await appts(supabase)
    .update({
      tipo: data.tipo,
      title: data.title.trim(),
      scheduled_at: normalizeScheduledAt(data.scheduled_at),
      location: data.location?.trim() || null,
      note: data.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
}

export async function toggleAppointmentDone(id: string, done: boolean) {
  const { supabase, org } = await getAuthContext();

  const { error } = await appts(supabase)
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
}

export async function deleteAppointment(id: string) {
  const { supabase, org } = await getAuthContext();

  const { error } = await appts(supabase)
    .delete()
    .eq('id', id)
    .eq('organization_id', org.organization_id);

  if (error) throw new Error(error.message);
  revalidatePath('/funil');
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
